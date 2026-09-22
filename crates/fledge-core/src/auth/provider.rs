use super::microsoft::{
    login_with_code, map_auth_error, refresh_session, DEFAULT_MSA_CLIENT_ID, MinecraftSession,
    MsTokens,
};
use super::token_vault::{AccountView, MicrosoftSecrets, StoredSecrets, TokenVault};
use crate::error::{CoreError, CoreResult};
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthStatus {
    LoggedOut,
    LoggingIn,
    LoggedIn,
    Refreshing,
    Expired,
}

impl AuthStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::LoggedOut => "logged_out",
            Self::LoggingIn => "logging_in",
            Self::LoggedIn => "logged_in",
            Self::Refreshing => "refreshing",
            Self::Expired => "expired",
        }
    }
}

type StatusListener = Arc<dyn Fn(AuthStatus, Option<AccountView>) + Send + Sync>;

#[derive(Clone)]
struct CachedSession {
    mc: MinecraftSession,
}

pub struct AuthProvider {
    vault: TokenVault,
    status: Mutex<AuthStatus>,
    listeners: Mutex<Vec<StatusListener>>,
    cache: Mutex<HashMap<String, CachedSession>>,
    active_id: Mutex<Option<String>>,
    client_id: Mutex<String>,
}

impl AuthProvider {
    pub fn new(vault: TokenVault) -> Self {
        Self {
            vault,
            status: Mutex::new(AuthStatus::LoggedOut),
            listeners: Mutex::new(Vec::new()),
            cache: Mutex::new(HashMap::new()),
            active_id: Mutex::new(None),
            client_id: Mutex::new(DEFAULT_MSA_CLIENT_ID.to_string()),
        }
    }

    pub fn set_client_id(&self, id: Option<&str>) {
        let next = id
            .map(str::trim)
            .filter(|s| !s.is_empty() && *s != "YOUR_AZURE_CLIENT_ID")
            .unwrap_or(DEFAULT_MSA_CLIENT_ID);
        *self.client_id.lock() = next.to_string();
    }

    pub fn client_id(&self) -> String {
        self.client_id.lock().clone()
    }

    pub fn on_status_change<F>(&self, listener: F)
    where
        F: Fn(AuthStatus, Option<AccountView>) + Send + Sync + 'static,
    {
        self.listeners.lock().push(Arc::new(listener));
    }

    fn set_status(&self, status: AuthStatus, account: Option<AccountView>) {
        *self.status.lock() = status;
        let listeners = self.listeners.lock().clone();
        for l in listeners {
            l(status, account.clone());
        }
    }

    pub fn status(&self) -> AuthStatus {
        *self.status.lock()
    }

    pub fn list_accounts(&self) -> CoreResult<Vec<AccountView>> {
        Ok(self
            .vault
            .list_accounts()?
            .into_iter()
            .map(|a| a.enrich())
            .collect())
    }

    pub async fn login_with_code(&self, code: &str) -> CoreResult<AccountView> {
        self.set_status(AuthStatus::LoggingIn, None);
        let client_id = self.client_id();
        match login_with_code(&client_id, code).await {
            Ok((ms, mc)) => {
                let account = AccountView {
                    id: mc.uuid.clone(),
                    uuid: mc.uuid.clone(),
                    display_name: mc.name.clone(),
                    xuid: None,
                    skin_url: None,
                    cape_url: None,
                    avatar_url: None,
                }
                .enrich();
                self.persist(&account, &ms, &mc)?;
                self.cache.lock().insert(
                    account.id.clone(),
                    CachedSession {
                        mc: mc.clone(),
                    },
                );
                *self.active_id.lock() = Some(account.id.clone());
                self.set_status(AuthStatus::LoggedIn, Some(account.clone()));
                Ok(account)
            }
            Err(err) => {
                let remaining = self.vault.read_account(None).ok().flatten();
                self.set_status(
                    if remaining.is_some() {
                        AuthStatus::LoggedIn
                    } else {
                        AuthStatus::LoggedOut
                    },
                    remaining,
                );
                let (_code, key) = map_auth_error(&err);
                Err(CoreError::msg(key))
            }
        }
    }

    pub fn logout(&self, account_id: Option<&str>) -> CoreResult<()> {
        let id = account_id
            .map(|s| s.to_string())
            .or_else(|| self.active_id.lock().clone())
            .or_else(|| self.vault.get_active_id().ok().flatten());
        let Some(id) = id else {
            self.set_status(AuthStatus::LoggedOut, None);
            return Ok(());
        };
        self.cache.lock().remove(&id);
        self.vault.remove_account(&id)?;
        let active = self.vault.get_active_id()?;
        *self.active_id.lock() = active.clone();
        if active.is_none() {
            self.set_status(AuthStatus::LoggedOut, None);
            return Ok(());
        }
        let remaining = self.vault.read_account(None)?.map(|a| a.enrich());
        self.set_status(AuthStatus::LoggedIn, remaining);
        Ok(())
    }

    pub fn switch_account(&self, account_id: &str) -> CoreResult<AccountView> {
        let account = self.vault.set_active(account_id)?.enrich();
        *self.active_id.lock() = Some(account_id.to_string());
        self.set_status(AuthStatus::LoggedIn, Some(account.clone()));
        Ok(account)
    }

    pub fn get_session(&self) -> CoreResult<(Option<AccountView>, AuthStatus)> {
        let account = self.vault.read_account(None)?.map(|a| a.enrich());
        if let Some(ref a) = account {
            *self.active_id.lock() = Some(a.id.clone());
        } else {
            *self.active_id.lock() = None;
            if *self.status.lock() != AuthStatus::LoggingIn {
                self.set_status(AuthStatus::LoggedOut, None);
            }
            return Ok((None, AuthStatus::LoggedOut));
        }
        let status = *self.status.lock();
        if status == AuthStatus::LoggingIn {
            return Ok((account, status));
        }
        Ok((account, AuthStatus::LoggedIn))
    }

    pub async fn ensure_credentials(&self, account_id: Option<&str>) -> CoreResult<Value> {
        let id = account_id
            .map(|s| s.to_string())
            .or_else(|| self.active_id.lock().clone())
            .or_else(|| self.vault.get_active_id().ok().flatten())
            .ok_or_else(|| CoreError::msg("auth.error.notLoggedIn"))?;

        // Use cache if not expired
        if let Some(cached) = self.cache.lock().get(&id).cloned() {
            let now = chrono::Utc::now().timestamp_millis() as u64;
            if cached.mc.expires_at_ms > now + 30_000 {
                return Ok(json!({
                  "uuid": cached.mc.uuid,
                  "name": cached.mc.name,
                  "accessToken": cached.mc.access_token,
                  "userType": "msa"
                }));
            }
        }

        self.refresh_credentials(&id).await
    }

    pub fn invalidate_cache(&self, account_id: Option<&str>) {
        let mut cache = self.cache.lock();
        if let Some(id) = account_id {
            cache.remove(id);
        } else {
            cache.clear();
        }
    }

    async fn refresh_credentials(&self, id: &str) -> CoreResult<Value> {
        self.set_status(AuthStatus::Refreshing, None);
        let secrets = self
            .vault
            .read_secrets(id)?
            .ok_or_else(|| CoreError::msg("auth.error.refreshFailed"))?;
        let client_id = self.client_id();
        match refresh_session(&client_id, &secrets.microsoft.refresh_token).await {
            Ok((ms, mc)) => {
                let account = self.vault.read_account(Some(id))?.map(|a| a.enrich());
                self.persist_secrets_only(id, &ms, &mc)?;
                self.cache.lock().insert(
                    id.to_string(),
                    CachedSession {
                        mc: mc.clone(),
                    },
                );
                self.set_status(AuthStatus::LoggedIn, account);
                Ok(json!({
                  "uuid": mc.uuid,
                  "name": mc.name,
                  "accessToken": mc.access_token,
                  "userType": "msa"
                }))
            }
            Err(err) => {
                self.set_status(AuthStatus::Expired, None);
                let (_c, key) = map_auth_error(&err);
                Err(CoreError::msg(key))
            }
        }
    }

    pub async fn refresh_active_best_effort(&self) {
        let id = match self.active_id.lock().clone().or_else(|| self.vault.get_active_id().ok().flatten())
        {
            Some(id) => id,
            None => return,
        };
        let _ = self.ensure_credentials(Some(&id)).await;
    }

    fn persist(
        &self,
        account: &AccountView,
        ms: &MsTokens,
        mc: &MinecraftSession,
    ) -> CoreResult<()> {
        self.vault.upsert_account(account.clone())?;
        self.persist_secrets_only(&account.id, ms, mc)
    }

    fn persist_secrets_only(
        &self,
        account_id: &str,
        ms: &MsTokens,
        mc: &MinecraftSession,
    ) -> CoreResult<()> {
        self.vault.write_secrets(
            account_id,
            &StoredSecrets {
                version: 1,
                microsoft: MicrosoftSecrets {
                    access_token: mc.access_token.clone(),
                    refresh_token: ms.refresh_token.clone(),
                    expires_at: Some(mc.expires_at_ms),
                },
            },
        )
    }

    pub fn vault(&self) -> &TokenVault {
        &self.vault
    }
}
