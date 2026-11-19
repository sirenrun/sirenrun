use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};
use session_keys::{Session, SessionTokenV2};

use crate::session::authorize;
use crate::state::{Balance, BALANCE_SEED};

#[commit]
#[derive(Accounts, Session)]
pub struct UndelegateBalance<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[session(signer = signer, authority = balance.owner.key())]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
    #[account(mut, seeds = [BALANCE_SEED, balance.owner.as_ref()], bump = balance.bump)]
    pub balance: Account<'info, Balance>,
}

pub fn undelegate_balance(ctx: Context<UndelegateBalance>) -> Result<()> {
    let accounts = &ctx.accounts;
    authorize(&**accounts, accounts.balance.owner == accounts.signer.key())?;
    ctx.accounts.balance.exit(&crate::ID)?;
    MagicIntentBundleBuilder::new(
        ctx.accounts.signer.to_account_info(),
        ctx.accounts.magic_context.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
    )
    .commit_and_undelegate(&[ctx.accounts.balance.to_account_info()])
    .build_and_invoke()?;
    Ok(())
}
