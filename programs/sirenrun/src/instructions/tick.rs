use anchor_lang::prelude::*;

use crate::state::{
    Arena, ArenaStatus, Balance, Config, TickTerms, ARENA_SEED, BALANCE_SEED, CONFIG_SEED, MARKETS,
};

#[event]
pub struct LineCrossed {
    pub arena: Pubkey,
    pub nonce: u32,
    pub market: u8,
    pub t: u32,
}

#[event]
pub struct RunSettled {
    pub arena: Pubkey,
    pub nonce: u32,
    pub t: u32,
    pub outcomes: u8,
    pub runner: Pubkey,
    /// The driver's cut of the run's trades.
    pub runner_fees: u64,
    /// Everything credited to the driver at the end: fees plus the bond left after a bust, or
    /// the full entry fee and bond when the run was refunded for a missing seed.
    pub runner_paid: u64,
}

#[event]
pub struct NitroUsed {
    pub arena: Pubkey,
    pub nonce: u32,
    pub runner: Pubkey,
    pub fee: u64,
}

/// No signer: validator 2.0 runs cranks on Hydra, which rejects any signer in a scheduled
/// instruction. Anyone may send `tick`; `Config.min_tick_slots` keeps a run at crank speed.
#[derive(Accounts)]
pub struct Tick<'info> {
    #[account(mut, seeds = [ARENA_SEED, &[arena.id]], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
    #[account(mut, seeds = [BALANCE_SEED, arena.runner.as_ref()], bump = runner_balance.bump)]
    pub runner_balance: Account<'info, Balance>,
    #[account(mut, seeds = [BALANCE_SEED, config.house.as_ref()], bump = house_balance.bump)]
    pub house_balance: Account<'info, Balance>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
}

/// `nonce` pins the call to one run, so leftover iterations of an earlier run's crank are
/// no-ops instead of a second clock. A tick too soon after the last one is also a no-op, not
/// an error, so a crank that fires early is not retried and backed off.
pub fn tick(ctx: Context<Tick>, nonce: u32) -> Result<()> {
    let arena = &mut ctx.accounts.arena;
    if arena.nonce != nonce || arena.status == ArenaStatus::Idle {
        return Ok(());
    }
    let config = &ctx.accounts.config;
    if !arena.claim_tick_slot(Clock::get()?.slot, config.min_tick_slots) {
        return Ok(());
    }
    let was_settled = arena.status == ArenaStatus::Settled;
    let effects = arena.advance(TickTerms {
        entry_fee: config.entry_fee,
        nitro_fee: config.nitro_fee,
        runner_available: ctx.accounts.runner_balance.available,
        house_available: ctx.accounts.house_balance.available,
        liquidity: config.liquidity,
    })?;

    effects.apply(
        &mut ctx.accounts.runner_balance,
        &mut ctx.accounts.house_balance,
    )?;

    let arena = &ctx.accounts.arena;
    if effects.runner_out > 0 {
        emit!(NitroUsed {
            arena: arena.key(),
            nonce,
            runner: arena.runner,
            fee: effects.runner_out,
        });
    }
    for market in (0..MARKETS as u8).filter(|m| effects.crossed & (1 << m) != 0) {
        emit!(LineCrossed {
            arena: arena.key(),
            nonce,
            market,
            t: arena.sim.t,
        });
    }
    if !was_settled && arena.status == ArenaStatus::Settled {
        emit!(RunSettled {
            arena: arena.key(),
            nonce,
            t: arena.sim.t,
            outcomes: arena.outcomes(),
            runner: arena.runner,
            runner_fees: arena.runner_fees,
            runner_paid: effects.runner,
        });
    }
    Ok(())
}
