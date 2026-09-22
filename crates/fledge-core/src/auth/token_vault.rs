use super::dpapi;
use crate::error::{CoreError, CoreResult};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountView {
    pub id: String,
    pub uuid: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub xuid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skin_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cape_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

impl AccountView {
    pub fn enrich(mut self) -> Self {
        let bare = self.uuid.replace('-', "");
        self.skin_url = Some(format!("https://mc-heads.net/skin/{bare}"));
        self.avatar_url = Some(format!("https://mc-heads.net/avatar/{bare}/64"));
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredSecrets {
    pub version: u32,
    pub microsoft: MicrosoftSecrets,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftSecrets {
    pub access_token: String,
    pub refresh_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexFile {
    version: u32,
    active_id: Option<String>,
    accounts: Vec<AccountView>,
}

pub struct TokenVault {
    accounts_dir: PathBuf,
    lock: Mutex<()>,
}

impl TokenVault {
    pub fn new(accounts_dir: impl Into<PathBuf>) -> Self {
        Self {
            accounts_dir: accounts_dir.into(),
            lock: Mutex::new(()),
        }
    }

    fn index_path(&self) -> PathBuf {
        self.accounts_dir.join("index.json")
    }

    fn secrets_dir(&self) -> PathBuf {
        self.accounts_dir.join("secrets")
    }

    fn secrets_path(&self, account_id: &str) -> PathBuf {
        self.secrets_dir().join(format!("{account_id}.dat"))
    }

    fn ensure_dirs(&self) -> CoreResult<()> {
        fs::create_dir_all(self.secrets_dir())?;
        Ok(())
    }

    fn read_index_unlocked(&self) -> CoreResult<IndexFile> {
        self.ensure_dirs()?;
        let path = self.index_path();
        if !path.exists() {
            return Ok(IndexFile {
                version: 1,
                active_id: None,
                accounts: vec![],
            });
        }
        let raw = fs::read_to_string(&path)?;
        let parsed: IndexFile = serde_json::from_str(&raw)?;
        Ok(parsed)
    }

    fn write_index_unlocked(&self, index: &IndexFile) -> CoreResult<()> {
        self.ensure_dirs()?;
        let dest = self.index_path();
        let body = serde_json::to_string_pretty(index)?;
        let tmp = dest.with_extension(format!("{}.tmp", std::process::id()));
        let mut last = None;
        for i in 0..8 {
            match (|| -> CoreResult<()> {
                fs::write(&tmp, &body)?;
                fs::rename(&tmp, &dest)?;
                Ok(())
            })() {
                Ok(()) => return Ok(()),
                Err(err) => {
                    let _ = fs::remove_file(&tmp);
                    last = Some(err);
                    thread::sleep(Duration::from_millis(80 * (i + 1)));
                }
            }
        }
        Err(last.unwrap_or_else(|| CoreError::msg("failed to write account index")))
    }

    pub fn list_accounts(&self) -> CoreResult<Vec<AccountView>> {
        let _g = self.lock.lock();
        Ok(self.read_index_unlocked()?.accounts)
    }

    pub fn get_active_id(&self) -> CoreResult<Option<String>> {
        let _g = self.lock.lock();
        Ok(self.read_index_unlocked()?.active_id)
    }

    pub fn read_account(&self, account_id: Option<&str>) -> CoreResult<Option<AccountView>> {
        let _g = self.lock.lock();
        let index = self.read_index_unlocked()?;
        let id = account_id
            .map(|s| s.to_string())
            .or(index.active_id.clone());
        let Some(id) = id else {
            return Ok(None);
        };
        Ok(index.accounts.into_iter().find(|a| a.id == id))
    }

    pub fn set_active(&self, account_id: &str) -> CoreResult<AccountView> {
        let _g = self.lock.lock();
        let mut index = self.read_index_unlocked()?;
        let account = index
            .accounts
            .iter()
            .find(|a| a.id == account_id)
            .cloned()
            .ok_or_else(|| CoreError::msg("account_not_found"))?;
        index.active_id = Some(account_id.to_string());
        self.write_index_unlocked(&index)?;
        Ok(account)
    }

    pub fn upsert_account(&self, account: AccountView) -> CoreResult<()> {
        let _g = self.lock.lock();
        let mut index = self.read_index_unlocked()?;
        if let Some(existing) = index.accounts.iter_mut().find(|a| a.id == account.id) {
            *existing = account.clone();
        } else {
            index.accounts.push(account.clone());
        }
        index.active_id = Some(account.id);
        self.write_index_unlocked(&index)
    }

    pub fn remove_account(&self, account_id: &str) -> CoreResult<()> {
        let _g = self.lock.lock();
        let mut index = self.read_index_unlocked()?;
        index.accounts.retain(|a| a.id != account_id);
        if index.active_id.as_deref() == Some(account_id) {
            index.active_id = index.accounts.first().map(|a| a.id.clone());
        }
        self.write_index_unlocked(&index)?;
        let _ = fs::remove_file(self.secrets_path(account_id));
        Ok(())
    }

    pub fn read_secrets(&self, account_id: &str) -> CoreResult<Option<StoredSecrets>> {
        let _g = self.lock.lock();
        let path = self.secrets_path(account_id);
        if !path.exists() {
            return Ok(None);
        }
        let blob = fs::read(&path)?;
        let plain = dpapi::unprotect(&blob).map_err(CoreError::msg)?;
        let secrets: StoredSecrets = serde_json::from_slice(&plain)?;
        Ok(Some(secrets))
    }

    pub fn write_secrets(&self, account_id: &str, secrets: &StoredSecrets) -> CoreResult<()> {
        let _g = self.lock.lock();
        self.ensure_dirs()?;
        let plain = serde_json::to_vec(secrets)?;
        let encrypted = dpapi::protect(&plain).map_err(CoreError::msg)?;
        let dest = self.secrets_path(account_id);
        let tmp = dest.with_extension(format!("{}.tmp", std::process::id()));
        fs::write(&tmp, &encrypted)?;
        fs::rename(tmp, dest)?;
        Ok(())
    }

    pub fn clear(&self) -> CoreResult<()> {
        let _g = self.lock.lock();
        let index = self.read_index_unlocked()?;
        for a in &index.accounts {
            let _ = fs::remove_file(self.secrets_path(&a.id));
        }
        self.write_index_unlocked(&IndexFile {
            version: 1,
            active_id: None,
            accounts: vec![],
        })?;
        Ok(())
    }

    pub fn accounts_dir(&self) -> &Path {
        &self.accounts_dir
    }
}
