use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};
use session_keys::{Session, SessionTokenV2};

use crate::errors::SirenrunError;
use crate::session::authorize;
use crate::state::{Arena, Balance, Config, ARENA_SEED, BALANCE_SEED, CONFIG_SEED};

/// The three arenas are passed read-only (pinned to their PDAs) so the program can refuse to
/// undelegate a balance that a run's crank still writes; see `Arena::uses_balance`.
#[commit]
#[derive(Accounts, Session)]
pub struct UndelegateBalance<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[session(signer = signer, authority = balance.owner.key())]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
    #[account(mut, seeds = [BALANCE_SEED, balance.owner.as_ref()], bump = balance.bump)]
    pub balance: Account<'info, Balance>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: address pinned by seeds; data read only when owned by this program.
    #[account(seeds = [ARENA_SEED, &[0]], bump)]
    pub arena_0: UncheckedAccount<'info>,
    /// CHECK: as `arena_0`.
    #[account(seeds = [ARENA_SEED, &[1]], bump)]
    pub arena_1: UncheckedAccount<'info>,
    /// CHECK: as `arena_0`.
    #[account(seeds = [ARENA_SEED, &[2]], bump)]
    pub arena_2: UncheckedAccount<'info>,
}

/// An arena that was never initialised holds nothing, so it counts as idle.
fn arena_uses(info: &AccountInfo, owner: &Pubkey, house: &Pubkey) -> Result<bool> {
    if info.data_is_empty() {
        return Ok(false);
    }
    require_keys_eq!(*info.owner, crate::ID, SirenrunError::InvalidArena);
    let arena = Arena::try_deserialize(&mut &info.data.borrow()[..])?;
    Ok(arena.uses_balance(owner, house))
}

pub fn undelegate_balance(ctx: Context<UndelegateBalance>) -> Result<()> {
    let accounts = &ctx.accounts;
    authorize(&**accounts, accounts.balance.owner == accounts.signer.key())?;
    let (owner, house) = (accounts.balance.owner, accounts.config.house);
    for arena in [&accounts.arena_0, &accounts.arena_1, &accounts.arena_2] {
        require!(
            !arena_uses(&arena.to_account_info(), &owner, &house)?,
            SirenrunError::BalanceInUse
        );
    }
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
