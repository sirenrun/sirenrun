use anchor_lang::prelude::*;
use session_keys::{SessionError, SessionV2};

use crate::errors::SirenrunError;

/// Same check as `session_keys::session_auth_or`, as a function: that macro rebuilds the
/// handler signature without its generics, so it cannot wrap handlers that need `'info`.
pub fn authorize<'info, A: SessionV2<'info>>(accounts: &A, signer_is_owner: bool) -> Result<()> {
    match accounts.session_token() {
        Some(token) => {
            require!(accounts.is_valid()?, SessionError::InvalidToken);
            require_keys_eq!(
                accounts.session_authority(),
                token.authority,
                SirenrunError::Unauthorized
            );
        }
        None => require!(signer_is_owner, SirenrunError::Unauthorized),
    }
    Ok(())
}
