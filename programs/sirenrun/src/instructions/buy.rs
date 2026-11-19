use anchor_lang::prelude::*;
use session_keys::{Session, SessionTokenV2};

use crate::session::authorize;
use crate::state::{Arena, Balance, BuyTerms, Config, Side, ARENA_SEED, BALANCE_SEED, CONFIG_SEED};

#[event]
pub struct Trade {
    pub arena: Pubkey,
    pub nonce: u32,
    pub market: u8,
    pub side: Side,
    pub net: u64,
    pub shares: u64,
    pub yes_r: u64,
    pub no_r: u64,
}

#[derive(Accounts, Session)]
pub struct Buy<'info> {
    pub signer: Signer<'info>,
    #[session(signer = signer, authority = trader_balance.owner.key())]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
    #[account(mut, seeds = [BALANCE_SEED, trader_balance.owner.as_ref()], bump = trader_balance.bump)]
    pub trader_balance: Account<'info, Balance>,
    #[account(mut, seeds = [BALANCE_SEED, config.house.as_ref()], bump = house_balance.bump)]
    pub house_balance: Account<'info, Balance>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [ARENA_SEED, &[arena.id]], bump = arena.bump)]
    pub arena: Account<'info, Arena>,
}

pub fn buy(ctx: Context<Buy>, market: u8, side: Side, amount: u64, min_shares: u64) -> Result<()> {
    let accounts = &ctx.accounts;
    authorize(
        &**accounts,
        accounts.trader_balance.owner == accounts.signer.key(),
    )?;

    let config = &ctx.accounts.config;
    let terms = BuyTerms {
        fee_bps: config.fee_bps,
        runner_fee_bps: config.runner_fee_bps,
        max_buy: config.max_buy,
    };
    let arena = &mut ctx.accounts.arena;
    let trade = arena.buy(
        &mut ctx.accounts.trader_balance,
        &mut ctx.accounts.house_balance,
        terms,
        market,
        side,
        amount,
        min_shares,
    )?;

    emit!(Trade {
        arena: arena.key(),
        nonce: arena.nonce,
        market,
        side,
        net: trade.net,
        shares: trade.fill.shares,
        yes_r: trade.fill.yes,
        no_r: trade.fill.no,
    });
    Ok(())
}
