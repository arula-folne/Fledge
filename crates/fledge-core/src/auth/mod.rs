mod dpapi;
pub mod microsoft;
mod provider;
mod session_proxy;
mod token_vault;

pub use microsoft::{
    auth_authorize_url, extract_code_from_url, DEFAULT_MSA_CLIENT_ID, MSA_REDIRECT_URI,
};
pub use provider::{AuthProvider, AuthStatus};
pub use session_proxy::SessionJoinProxy;
pub use token_vault::{AccountView, TokenVault};
