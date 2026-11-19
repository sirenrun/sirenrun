use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod session;
pub mod sim;
pub mod state;

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

    pub fn undelegate_balance(ctx: Context<UndelegateBalance>) -> Result<()> {
        instructions::undelegate_balance(ctx)
    }

    pub fn init_arena(ctx: Context<InitArena>, id: u8) -> Result<()> {
        instructions::init_arena(ctx, id)
    }

    pub fn delegate_arena(ctx: Context<DelegateArena>, id: u8) -> Result<()> {
        instructions::delegate_arena(ctx, id)
    }

    pub fn start_run<'info>(ctx: Context<'info, StartRun<'info>>) -> Result<()> {
        instructions::start_run(ctx)
    }

    pub fn vrf_callback_seed(
        ctx: Context<VrfCallbackSeed>,
        randomness: [u8; 32],
        nonce: u32,
    ) -> Result<()> {
        instructions::vrf_callback_seed(ctx, randomness, nonce)
    }

    pub fn set_input(ctx: Context<SetInput>, target_lane: u8, nitro: bool) -> Result<()> {
        instructions::set_input(ctx, target_lane, nitro)
    }

    pub fn tick(ctx: Context<Tick>, nonce: u32) -> Result<()> {
        instructions::tick(ctx, nonce)
    }
}
