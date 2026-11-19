use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::vrf;
use ephemeral_rollups_sdk::vrf::consts::{
    program_identity_pubkey, DEFAULT_EPHEMERAL_QUEUE, DEFAULT_EPHEMERAL_TEST_QUEUE,
};
use ephemeral_rollups_sdk::vrf::instructions::{
    create_request_randomness_ix_const, RequestRandomnessParams,
};
use ephemeral_rollups_sdk::vrf::types::SerializableAccountMeta;
use session_keys::{Session, SessionTokenV2};

use crate::errors::SirenrunError;
use crate::sim::SimState;
use crate::state::{Arena, ArenaStatus, Balance, Config, ARENA_SEED, BALANCE_SEED, CONFIG_SEED};

const PROGRAM_IDENTITY: Pubkey = program_identity_pubkey(&crate::ID);

#[event]
pub struct RunStarted {
    pub arena: Pubkey,
    pub nonce: u32,
    pub runner: Pubkey,
}

#[vrf]
#[derive(Accounts, Session)]
pub struct StartRun<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[session(signer = signer, authority = runner_balance.owner.key())]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
    #[account(mut, seeds = [BALANCE_SEED, runner_balance.owner.as_ref()], bump = runner_balance.bump)]
    pub runner_balance: Account<'info, Balance>,
    #[account(mut, seeds = [BALANCE_SEED, config.house.as_ref()], bump = house_balance.bump)]
    pub house_balance: Account<'info, Balance>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [ARENA_SEED, &[arena.id]], bump = arena.bump)]
    pub arena: Account<'info, Arena>,
    /// CHECK: this program's VRF identity PDA, checked against a compile-time constant
    #[account(address = PROGRAM_IDENTITY)]
    pub program_identity: UncheckedAccount<'info>,
    /// CHECK: one of the delegated VRF queues; the VRF program validates it
    #[account(
        mut,
        constraint = oracle_queue.key() == DEFAULT_EPHEMERAL_QUEUE
            || oracle_queue.key() == DEFAULT_EPHEMERAL_TEST_QUEUE
    )]
    pub oracle_queue: UncheckedAccount<'info>,
}

pub fn start_run(ctx: Context<StartRun>) -> Result<()> {
    let config = &ctx.accounts.config;
    let arena = &mut ctx.accounts.arena;
    require!(arena.status == ArenaStatus::Idle, SirenrunError::ArenaBusy);

    let stake = config
        .entry_fee
        .checked_add(config.bond)
        .ok_or(SirenrunError::MathOverflow)?;
    ctx.accounts.runner_balance.debit(stake)?;
    ctx.accounts.house_balance.credit(config.entry_fee)?;

    arena.nonce = arena
        .nonce
        .checked_add(1)
        .ok_or(SirenrunError::MathOverflow)?;
    arena.runner = ctx.accounts.runner_balance.owner;
    arena.status = ArenaStatus::Staging;
    arena.phase_ticks = 0;
    arena.seed_ready = false;
    arena.seed = 0;
    arena.sim = SimState::start().into();
    arena.bond = config.bond;
    arena.no_profit_oi = 0;
    arena.runner_fees = 0;

    let slot = Clock::get()?.slot;
    let mut caller_seed = [0u8; 32];
    caller_seed[0] = arena.id;
    caller_seed[1..5].copy_from_slice(&arena.nonce.to_le_bytes());
    caller_seed[5..13].copy_from_slice(&slot.to_le_bytes());

    let request = create_request_randomness_ix_const(
        RequestRandomnessParams {
            payer: ctx.accounts.signer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: crate::instruction::VrfCallbackSeed::DISCRIMINATOR.to_vec(),
            caller_seed,
            accounts_metas: Some(vec![SerializableAccountMeta {
                pubkey: arena.key(),
                is_signer: false,
                is_writable: true,
            }]),
            callback_args: Some(arena.nonce.to_le_bytes().to_vec()),
        },
        PROGRAM_IDENTITY,
    );

    emit!(RunStarted {
        arena: arena.key(),
        nonce: arena.nonce,
        runner: arena.runner,
    });

    ctx.accounts
        .invoke_signed_vrf(&ctx.accounts.signer.to_account_info(), &request)?;
    Ok(())
}
