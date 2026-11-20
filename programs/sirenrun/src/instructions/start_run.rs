use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::InstructionData;
use ephemeral_rollups_sdk::anchor::{vrf, MagicProgram};
#[allow(deprecated)]
use ephemeral_rollups_sdk::crank::{ScheduleCrankCpi, ScheduleTaskArgs};
use ephemeral_rollups_sdk::vrf::consts::{
    program_identity_pubkey, DEFAULT_EPHEMERAL_QUEUE, DEFAULT_EPHEMERAL_TEST_QUEUE,
};
use ephemeral_rollups_sdk::vrf::instructions::{
    create_request_randomness_ix_const, RequestRandomnessParams,
};
use ephemeral_rollups_sdk::vrf::types::SerializableAccountMeta;
use session_keys::{Session, SessionTokenV2};

use crate::constants::{MAX_LIVE_TICKS, SEED_TIMEOUT_TICKS, SETTLE_TICKS, STAGING_TICKS, TICK_MS};
use crate::instructions::tick::crank_signer_pda;
use crate::session::authorize;
use crate::state::{Arena, Balance, Config, RunTerms, ARENA_SEED, BALANCE_SEED, CONFIG_SEED};

const PROGRAM_IDENTITY: Pubkey = program_identity_pubkey(&crate::ID);

/// Enough iterations for the longest run: staging, seed timeout, live, settle.
const CRANK_ITERATIONS: u32 = STAGING_TICKS + SEED_TIMEOUT_TICKS + MAX_LIVE_TICKS + SETTLE_TICKS;

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
    pub arena: Box<Account<'info, Arena>>,
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
    pub magic_program: Program<'info, MagicProgram>,
}

pub fn start_run<'info>(ctx: Context<'info, StartRun<'info>>) -> Result<()> {
    let accounts = &ctx.accounts;
    authorize(
        &**accounts,
        accounts.runner_balance.owner == accounts.signer.key(),
    )?;
    let config = &ctx.accounts.config;
    let terms = RunTerms {
        entry_fee: config.entry_fee,
        bond: config.bond,
        liquidity: config.liquidity,
        open_bps: config.open_bps,
    };
    let arena = &mut ctx.accounts.arena;
    arena.start(
        &mut ctx.accounts.runner_balance,
        &mut ctx.accounts.house_balance,
        terms,
    )?;

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
    schedule_ticks(ctx.accounts)
}

/// The arena PDA is the task authority, so the crank signer is fixed per arena and `tick`
/// can verify it without storing anything.
#[allow(deprecated)]
fn schedule_ticks<'info>(accounts: &'info StartRun<'info>) -> Result<()> {
    let arena = &accounts.arena;
    let arena_key = arena.key();
    let tick_ix = Instruction {
        program_id: crate::ID,
        accounts: vec![
            AccountMeta::new(arena_key, false),
            AccountMeta::new(accounts.runner_balance.key(), false),
            AccountMeta::new(accounts.house_balance.key(), false),
            AccountMeta::new_readonly(accounts.config.key(), false),
            AccountMeta::new_readonly(crank_signer_pda(&arena_key), true),
        ],
        data: crate::instruction::Tick { nonce: arena.nonce }.data(),
    };
    let mut task_id = [0u8; 8];
    task_id[..4].copy_from_slice(&arena.nonce.to_le_bytes());
    task_id[4..].copy_from_slice(&arena_key.to_bytes()[..4]);

    ScheduleCrankCpi {
        payer: arena.as_ref().as_ref(),
        magic_program: &accounts.magic_program,
        instruction_accounts: &[
            arena.to_account_info(),
            accounts.runner_balance.to_account_info(),
            accounts.house_balance.to_account_info(),
            accounts.config.to_account_info(),
        ],
        args: ScheduleTaskArgs {
            task_id: i64::from_le_bytes(task_id),
            execution_interval_millis: i64::from(TICK_MS),
            iterations: i64::from(CRANK_ITERATIONS),
            instructions: vec![tick_ix],
        },
    }
    .invoke_signed(&[&[ARENA_SEED, &[arena.id], &[arena.bump]]])?;
    Ok(())
}
