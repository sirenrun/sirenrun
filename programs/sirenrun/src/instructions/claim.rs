use anchor_lang::prelude::*;
use session_keys::{Session, SessionTokenV2};

use crate::errors::SirenrunError;
use crate::session::authorize;
use crate::state::{Arena, Balance, Config, ARENA_SEED, BALANCE_SEED, CONFIG_SEED};

#[event]
pub struct Claimed {
    pub owner: Pubkey,
    pub arena: Pubkey,
    pub nonce: u32,
    pub market: u8,
    pub paid: u64,
}

/// The arena is read-only here, so claims never compete with the crank for its write lock.
#[derive(Accounts, Session)]
pub struct Claim<'info> {
    pub signer: Signer<'info>,
    #[session(signer = signer, authority = trader_balance.owner.key())]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
    #[account(mut, seeds = [BALANCE_SEED, trader_balance.owner.as_ref()], bump = trader_balance.bump)]
    pub trader_balance: Account<'info, Balance>,
    #[account(mut, seeds = [BALANCE_SEED, config.house.as_ref()], bump = house_balance.bump)]
    pub house_balance: Account<'info, Balance>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [ARENA_SEED, &[arena.id]], bump = arena.bump)]
    pub arena: Account<'info, Arena>,
}

pub fn claim(ctx: Context<Claim>, entry_index: u8) -> Result<()> {
    let accounts = &ctx.accounts;
    authorize(
        &**accounts,
        accounts.trader_balance.owner == accounts.signer.key(),
    )?;

    let entry = *ctx
        .accounts
        .trader_balance
        .entries
        .get(usize::from(entry_index))
        .ok_or(SirenrunError::NoEntry)?;
    let paid = ctx.accounts.arena.claim(
        &mut ctx.accounts.trader_balance,
        &mut ctx.accounts.house_balance,
        entry_index,
    )?;

    emit!(Claimed {
        owner: ctx.accounts.trader_balance.owner,
        arena: ctx.accounts.arena.key(),
        nonce: entry.nonce,
        market: entry.market,
        paid,
    });
    Ok(())
}
