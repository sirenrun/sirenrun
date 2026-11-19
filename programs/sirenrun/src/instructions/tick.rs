use anchor_lang::prelude::*;

use crate::state::{Arena, ArenaStatus, Balance, Config, ARENA_SEED, BALANCE_SEED, CONFIG_SEED};

pub const CRANK_PROGRAM_ID: Pubkey = pubkey!("Crank11111111111111111111111111111111111111");

/// The only signer the MagicBlock scheduler can attach to a scheduled instruction for the
/// task authority, here the arena PDA.
pub fn crank_signer_pda(arena: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"crank-executor", arena.as_ref()], &CRANK_PROGRAM_ID).0
}

#[event]
pub struct RunSettled {
    pub arena: Pubkey,
    pub nonce: u32,
    pub t: u32,
    pub outcomes: u8,
}

#[derive(Accounts)]
pub struct Tick<'info> {
    #[account(mut, seeds = [ARENA_SEED, &[arena.id]], bump = arena.bump)]
    pub arena: Account<'info, Arena>,
    #[account(mut, seeds = [BALANCE_SEED, arena.runner.as_ref()], bump = runner_balance.bump)]
    pub runner_balance: Account<'info, Balance>,
    #[account(mut, seeds = [BALANCE_SEED, config.house.as_ref()], bump = house_balance.bump)]
    pub house_balance: Account<'info, Balance>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(address = crank_signer_pda(&arena.key()))]
    pub crank_signer: Signer<'info>,
}

/// `nonce` pins the call to one run, so leftover iterations of an earlier run's crank are
/// no-ops instead of a second clock.
pub fn tick(ctx: Context<Tick>, nonce: u32) -> Result<()> {
    let arena = &mut ctx.accounts.arena;
    if arena.nonce != nonce {
        return Ok(());
    }
    let was_settled = arena.status == ArenaStatus::Settled;
    let payouts = arena.advance(ctx.accounts.config.entry_fee)?;

    ctx.accounts.runner_balance.credit(payouts.runner)?;
    ctx.accounts.house_balance.credit(payouts.house_in)?;
    ctx.accounts.house_balance.debit(payouts.house_out)?;

    let arena = &ctx.accounts.arena;
    if !was_settled && arena.status == ArenaStatus::Settled {
        emit!(RunSettled {
            arena: arena.key(),
            nonce,
            t: arena.sim.t,
            outcomes: arena.outcomes(),
        });
    }
    Ok(())
}
