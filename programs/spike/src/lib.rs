#![allow(deprecated)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::InstructionData;
use ephemeral_rollups_sdk::anchor::{delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::crank::{CancelCrankCpi, ScheduleCrankCpi, ScheduleTaskArgs};
use session_keys::{session_auth_or, Session, SessionError, SessionTokenV2};

declare_id!("BaKcbqdtXv7TnFSerT7LB1tjwAwYaLMtnaenhVRKsBnn");

pub const PROBE_SEED: &[u8] = b"probe";
pub const CRANK_PROGRAM_ID: Pubkey = pubkey!("Crank11111111111111111111111111111111111111");

pub fn crank_signer_pda(authority: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"crank-executor", authority.as_ref()], &CRANK_PROGRAM_ID).0
}

#[ephemeral]
#[program]
pub mod spike {
    use super::*;

    pub fn init(ctx: Context<Init>) -> Result<()> {
        ctx.accounts.probe.owner = ctx.accounts.payer.key();
        Ok(())
    }

    pub fn delegate(ctx: Context<DelegateProbe>) -> Result<()> {
        let owner = ctx.accounts.payer.key();
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[PROBE_SEED, owner.as_ref()],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|a| a.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    pub fn schedule<'info>(
        ctx: Context<'info, Schedule<'info>>,
        task_id: i64,
        interval_ms: i64,
        iterations: i64,
    ) -> Result<()> {
        let tick_ix = Instruction {
            program_id: crate::ID,
            accounts: vec![AccountMeta::new(ctx.accounts.probe.key(), false)],
            data: instruction::Tick {}.data(),
        };
        ScheduleCrankCpi {
            payer: &ctx.accounts.payer,
            magic_program: &ctx.accounts.magic_program,
            instruction_accounts: &[
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.probe.to_account_info(),
            ],
            args: ScheduleTaskArgs {
                task_id,
                execution_interval_millis: interval_ms,
                iterations,
                instructions: vec![tick_ix],
            },
        }
        .invoke()?;
        Ok(())
    }

    pub fn schedule_signed<'info>(
        ctx: Context<'info, Schedule<'info>>,
        task_id: i64,
        interval_ms: i64,
        iterations: i64,
    ) -> Result<()> {
        let tick_ix = Instruction {
            program_id: crate::ID,
            accounts: vec![
                AccountMeta::new(ctx.accounts.probe.key(), false),
                AccountMeta::new_readonly(crank_signer_pda(&ctx.accounts.payer.key()), true),
            ],
            data: instruction::TickSigned {}.data(),
        };
        ScheduleCrankCpi {
            payer: &ctx.accounts.payer,
            magic_program: &ctx.accounts.magic_program,
            instruction_accounts: &[
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.probe.to_account_info(),
            ],
            args: ScheduleTaskArgs {
                task_id,
                execution_interval_millis: interval_ms,
                iterations,
                instructions: vec![tick_ix],
            },
        }
        .invoke()?;
        Ok(())
    }

    pub fn tick_signed(ctx: Context<TickSigned>) -> Result<()> {
        let probe = &mut ctx.accounts.probe;
        probe.ticks += 1;
        probe.last_slot = Clock::get()?.slot;
        Ok(())
    }

    pub fn cancel<'info>(ctx: Context<'info, Schedule<'info>>, task_id: i64) -> Result<()> {
        CancelCrankCpi {
            authority: &ctx.accounts.payer,
            task_context: &ctx.accounts.probe,
            magic_program: &ctx.accounts.magic_program,
            crank_id: task_id,
        }
        .invoke()?;
        Ok(())
    }

    pub fn tick(ctx: Context<Tick>) -> Result<()> {
        let probe = &mut ctx.accounts.probe;
        probe.ticks += 1;
        probe.last_slot = Clock::get()?.slot;
        Ok(())
    }

    #[session_auth_or(
        ctx.accounts.probe.owner == ctx.accounts.signer.key(),
        SessionError::InvalidToken
    )]
    pub fn session_ping(ctx: Context<SessionPing>) -> Result<()> {
        ctx.accounts.probe.pings += 1;
        Ok(())
    }
}

#[account]
pub struct Probe {
    pub owner: Pubkey,
    pub ticks: u64,
    pub last_slot: u64,
    pub pings: u64,
}

#[derive(Accounts)]
pub struct Init<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 8 * 3,
        seeds = [PROBE_SEED, payer.key().as_ref()],
        bump
    )]
    pub probe: Account<'info, Probe>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateProbe<'info> {
    pub payer: Signer<'info>,
    /// CHECK: delegated PDA
    #[account(mut, del, seeds = [PROBE_SEED, payer.key().as_ref()], bump)]
    pub pda: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Schedule<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: passed through to the Magic program; unchecked so Anchor does not write stale data back
    #[account(mut, seeds = [PROBE_SEED, payer.key().as_ref()], bump)]
    pub probe: UncheckedAccount<'info>,
    /// CHECK: Magic program
    pub magic_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Tick<'info> {
    #[account(mut)]
    pub probe: Account<'info, Probe>,
}

#[derive(Accounts)]
pub struct TickSigned<'info> {
    #[account(mut)]
    pub probe: Account<'info, Probe>,
    #[account(address = crank_signer_pda(&probe.owner))]
    pub crank_signer: Signer<'info>,
}

#[derive(Accounts, Session)]
pub struct SessionPing<'info> {
    #[account(mut)]
    pub probe: Account<'info, Probe>,
    #[session(signer = signer, authority = probe.owner.key())]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
    #[account(mut)]
    pub signer: Signer<'info>,
}
