use anchor_lang::prelude::*;
use session_keys::{Session, SessionTokenV2};

use crate::errors::SirenrunError;
use crate::session::authorize;
use crate::sim::SimState;
use crate::state::{Arena, ArenaStatus, ARENA_SEED};

#[derive(Accounts, Session)]
pub struct SetInput<'info> {
    pub signer: Signer<'info>,
    #[session(signer = signer, authority = arena.runner.key())]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
    #[account(mut, seeds = [ARENA_SEED, &[arena.id]], bump = arena.bump)]
    pub arena: Account<'info, Arena>,
}

pub fn set_input(ctx: Context<SetInput>, target_lane: u8, nitro: bool) -> Result<()> {
    let accounts = &ctx.accounts;
    authorize(&**accounts, accounts.arena.runner == accounts.signer.key())?;
    let arena = &mut ctx.accounts.arena;
    require!(
        matches!(arena.status, ArenaStatus::Staging | ArenaStatus::Live),
        SirenrunError::ArenaNotLive
    );
    let mut sim = SimState::from(arena.sim);
    sim.set_input(target_lane, nitro);
    arena.sim = sim.into();
    Ok(())
}
