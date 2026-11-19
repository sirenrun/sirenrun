use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;
use session_keys::{session_auth_or, SessionError};

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod sim;
pub mod state;

use errors::SirenrunError;
use instructions::*;
use state::ConfigParams;

declare_id!("8NnGx94QrpwcUW6LL7NBzbgrTPUfVyaLsd8iHnfserHj");

#[ephemeral]
#[program]
pub mod sirenrun {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, params: ConfigParams) -> Result<()> {
        instructions::init_config(ctx, params)
    }

    pub fn update_config(ctx: Context<UpdateConfig>, params: ConfigParams) -> Result<()> {
        instructions::update_config(ctx, params)
    }

    pub fn init_balance(ctx: Context<InitBalance>) -> Result<()> {
        instructions::init_balance(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw(ctx, amount)
    }

    pub fn delegate_balance(ctx: Context<DelegateBalance>) -> Result<()> {
        instructions::delegate_balance(ctx)
    }

    #[session_auth_or(
        ctx.accounts.balance.owner == ctx.accounts.signer.key(),
        SirenrunError::Unauthorized
    )]
    pub fn undelegate_balance(ctx: Context<UndelegateBalance>) -> Result<()> {
        instructions::undelegate_balance(ctx)
    }

    pub fn init_arena(ctx: Context<InitArena>, id: u8) -> Result<()> {
        instructions::init_arena(ctx, id)
    }

    pub fn delegate_arena(ctx: Context<DelegateArena>, id: u8) -> Result<()> {
        instructions::delegate_arena(ctx, id)
    }

    #[session_auth_or(
        ctx.accounts.runner_balance.owner == ctx.accounts.signer.key(),
        SirenrunError::Unauthorized
    )]
    pub fn start_run(ctx: Context<StartRun>) -> Result<()> {
        instructions::start_run(ctx)
    }

    pub fn vrf_callback_seed(
        ctx: Context<VrfCallbackSeed>,
        randomness: [u8; 32],
        nonce: u32,
    ) -> Result<()> {
        instructions::vrf_callback_seed(ctx, randomness, nonce)
    }

    #[session_auth_or(
        ctx.accounts.arena.runner == ctx.accounts.signer.key(),
        SirenrunError::Unauthorized
    )]
    pub fn set_input(ctx: Context<SetInput>, target_lane: u8, nitro: bool) -> Result<()> {
        instructions::set_input(ctx, target_lane, nitro)
    }
}
