use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::vrf_callback;
use ephemeral_rollups_sdk::vrf::consts::scoped_vrf_identity_const;

use crate::state::{Arena, ArenaStatus};

#[event]
pub struct SeedSet {
    pub arena: Pubkey,
    pub nonce: u32,
}

const VRF_IDENTITY: Pubkey = Pubkey::new_from_array(scoped_vrf_identity_const(&crate::ID).0);

/// Declares the identity signer itself: the macro's version derives the PDA on every call
/// (about 197k CU), while this constant is computed at compile time.
#[vrf_callback]
#[derive(Accounts)]
pub struct VrfCallbackSeed<'info> {
    #[account(address = VRF_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,
    #[account(mut)]
    pub arena: Account<'info, Arena>,
}

/// Late or repeated fulfilments for an older run are ignored rather than rejected, so the
/// oracle never retries them.
pub fn vrf_callback_seed(
    ctx: Context<VrfCallbackSeed>,
    randomness: [u8; 32],
    nonce: u32,
) -> Result<()> {
    let arena = &mut ctx.accounts.arena;
    if arena.status != ArenaStatus::Staging || arena.nonce != nonce || arena.seed_ready {
        return Ok(());
    }
    let mut seed = [0u8; 8];
    seed.copy_from_slice(&randomness[..8]);
    arena.seed = u64::from_le_bytes(seed);
    arena.seed_ready = true;
    emit!(SeedSet {
        arena: arena.key(),
        nonce,
    });
    Ok(())
}
