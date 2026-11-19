#![allow(dead_code)]

use anchor_lang::prelude::Pubkey;
use anchor_lang::{
    pubkey, system_program, AccountDeserialize, Id, InstructionData, ToAccountMetas,
};
use anchor_spl::token::Token;
use ephemeral_rollups_sdk::anchor::{DelegationProgram, MagicProgram};
use ephemeral_rollups_sdk::consts::{DELEGATION_PROGRAM_ID, MAGIC_CONTEXT_ID};
use ephemeral_rollups_sdk::pda::{
    delegate_buffer_pda_from_delegated_account_and_owner_program,
    delegation_metadata_pda_from_delegated_account, delegation_record_pda_from_delegated_account,
};
use ephemeral_rollups_sdk::vrf::consts::{
    program_identity_pubkey, DEFAULT_EPHEMERAL_QUEUE, VRF_PROGRAM_ID,
};
use magicsvm::{MagicSVM, TransactionTarget};
use sirenrun::state::{
    Arena, Balance, ConfigParams, ARENA_SEED, BALANCE_SEED, CONFIG_SEED, VAULT_SEED,
};
use sirenrun::{accounts, instruction};
use solana_account::Account;
use solana_address::Address;
use solana_clock::Clock;
use solana_instruction::error::InstructionError;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;
use solana_transaction_error::TransactionError;

pub use magicsvm::TransactionTarget::{Base, Ephemeral};

pub const TUSDC: u64 = 1_000_000;
pub const ACCOUNT_OWNED_BY_WRONG_PROGRAM: u32 = 3007;

const DECIMALS: u8 = 6;
const SPL_MINT_LEN: usize = 82;
const SPL_TOKEN_ACCOUNT_LEN: usize = 165;
const SLOT_HASHES: Pubkey = pubkey!("SysvarS1otHashes111111111111111111111111111");

pub fn address(pubkey: Pubkey) -> Address {
    Address::new_from_array(pubkey.to_bytes())
}

pub fn pubkey(address: Address) -> Pubkey {
    Pubkey::new_from_array(address.to_bytes())
}

pub fn key(signer: &Keypair) -> Pubkey {
    pubkey(signer.pubkey())
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &sirenrun::ID).0
}

pub fn balance_pda(owner: &Pubkey) -> Pubkey {
    pda(&[BALANCE_SEED, owner.as_ref()])
}

pub fn arena_pda(id: u8) -> Pubkey {
    pda(&[ARENA_SEED, &[id]])
}

fn ix(data: impl InstructionData, accounts: impl ToAccountMetas) -> Instruction {
    Instruction {
        program_id: address(sirenrun::ID),
        accounts: accounts
            .to_account_metas(None)
            .into_iter()
            .map(|m| AccountMeta {
                pubkey: address(m.pubkey),
                is_signer: m.is_signer,
                is_writable: m.is_writable,
            })
            .collect(),
        data: data.data(),
    }
}

fn with_validator(mut ix: Instruction, validator: Address) -> Instruction {
    ix.accounts
        .push(AccountMeta::new_readonly(validator, false));
    ix
}

/// Packs an initialized SPL mint: mint authority set, no freeze authority.
fn mint_data(authority: Pubkey, supply: u64) -> Vec<u8> {
    let mut data = vec![0u8; SPL_MINT_LEN];
    data[0..4].copy_from_slice(&1u32.to_le_bytes());
    data[4..36].copy_from_slice(authority.as_ref());
    data[36..44].copy_from_slice(&supply.to_le_bytes());
    data[44] = DECIMALS;
    data[45] = 1;
    data
}

/// Packs an initialized SPL token account with no delegate or close authority.
fn token_account_data(mint: Pubkey, owner: Pubkey, amount: u64) -> Vec<u8> {
    let mut data = vec![0u8; SPL_TOKEN_ACCOUNT_LEN];
    data[0..32].copy_from_slice(mint.as_ref());
    data[32..64].copy_from_slice(owner.as_ref());
    data[64..72].copy_from_slice(&amount.to_le_bytes());
    data[108] = 1;
    data
}

pub fn custom_code(result: Result<(), TransactionError>) -> u32 {
    match result {
        Err(TransactionError::InstructionError(_, InstructionError::Custom(code))) => code,
        other => panic!("expected a custom program error, got {other:?}"),
    }
}

pub struct World {
    pub svm: MagicSVM,
    pub admin: Keypair,
    pub user: Keypair,
    pub mint: Pubkey,
    pub user_token: Pubkey,
    pub config: Pubkey,
    pub vault: Pubkey,
    pub last_compute_units: u64,
}

impl World {
    pub fn new() -> Self {
        let mut svm = MagicSVM::new();
        let so = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/deploy/sirenrun.so"
        );
        svm.add_program_from_file(address(sirenrun::ID), so)
            .expect("load sirenrun.so; run `anchor build` first");

        let admin = Keypair::new();
        let user = Keypair::new();
        for k in [&admin, &user] {
            svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
        }

        let mint = Pubkey::new_unique();
        let user_token = Pubkey::new_unique();
        let token_program = address(Token::id());
        let mint_rent = svm.minimum_balance_for_rent_exemption(SPL_MINT_LEN);
        let token_rent = svm.minimum_balance_for_rent_exemption(SPL_TOKEN_ACCOUNT_LEN);
        svm.set_account(
            address(mint),
            Account {
                lamports: mint_rent,
                data: mint_data(key(&admin), 100 * TUSDC),
                owner: token_program,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
        svm.set_account(
            address(user_token),
            Account {
                lamports: token_rent,
                data: token_account_data(mint, key(&user), 100 * TUSDC),
                owner: token_program,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();

        Self {
            svm,
            admin,
            user,
            mint,
            user_token,
            config: pda(&[CONFIG_SEED]),
            vault: pda(&[VAULT_SEED]),
            last_compute_units: 0,
        }
    }

    /// A world with config and the user's balance initialised on the base layer.
    pub fn ready() -> Self {
        let mut world = Self::new();
        world.init_config().expect("init_config");
        let user = world.user.insecure_clone();
        world.init_balance(&user).expect("init_balance");
        world
    }

    pub fn stranger(&mut self) -> Keypair {
        let stranger = Keypair::new();
        self.svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
        stranger
    }

    pub fn send(
        &mut self,
        target: TransactionTarget,
        signer: &Keypair,
        instruction: Instruction,
    ) -> Result<(), TransactionError> {
        let message = Message::new(&[instruction], Some(&signer.pubkey()));
        let tx = Transaction::new(&[signer], message, self.svm.latest_blockhash_for(target));
        let result = match self.svm.send_transaction_to(target, tx) {
            Ok(meta) => {
                self.last_compute_units = meta.compute_units_consumed;
                Ok(())
            }
            Err(failed) => Err(failed.err),
        };
        self.svm.expire_blockhash_for(target);
        result
    }

    pub fn params(&self) -> ConfigParams {
        ConfigParams {
            house: key(&self.admin),
            fee_bps: 200,
            runner_fee_bps: 100,
            entry_fee: TUSDC,
            bond: 25 * TUSDC,
            liquidity: 50 * TUSDC,
            max_buy: 50 * TUSDC,
        }
    }

    pub fn init_config(&mut self) -> Result<(), TransactionError> {
        let admin = self.admin.insecure_clone();
        let ix = ix(
            instruction::InitConfig {
                params: self.params(),
            },
            accounts::InitConfig {
                admin: key(&admin),
                config: self.config,
                mint: self.mint,
                vault: self.vault,
                token_program: Token::id(),
                system_program: system_program::ID,
            },
        );
        self.send(Base, &admin, ix)
    }

    pub fn update_config(
        &mut self,
        signer: &Keypair,
        params: ConfigParams,
    ) -> Result<(), TransactionError> {
        let ix = ix(
            instruction::UpdateConfig { params },
            accounts::UpdateConfig {
                admin: key(signer),
                config: self.config,
            },
        );
        self.send(Base, signer, ix)
    }

    pub fn init_balance(&mut self, owner: &Keypair) -> Result<(), TransactionError> {
        let ix = ix(
            instruction::InitBalance {},
            accounts::InitBalance {
                owner: key(owner),
                balance: balance_pda(&key(owner)),
                system_program: system_program::ID,
            },
        );
        self.send(Base, owner, ix)
    }

    pub fn deposit(&mut self, amount: u64) -> Result<(), TransactionError> {
        let user = self.user.insecure_clone();
        let ix = ix(
            instruction::Deposit { amount },
            accounts::Deposit {
                owner: key(&user),
                balance: balance_pda(&key(&user)),
                config: self.config,
                mint: self.mint,
                owner_token: self.user_token,
                vault: self.vault,
                token_program: Token::id(),
            },
        );
        self.send(Base, &user, ix)
    }

    pub fn withdraw(&mut self, amount: u64) -> Result<(), TransactionError> {
        let user = self.user.insecure_clone();
        let ix = ix(
            instruction::Withdraw { amount },
            accounts::Withdraw {
                owner: key(&user),
                balance: balance_pda(&key(&user)),
                config: self.config,
                mint: self.mint,
                owner_token: self.user_token,
                vault: self.vault,
                token_program: Token::id(),
            },
        );
        self.send(Base, &user, ix)
    }

    pub fn delegate_balance(&mut self, owner: &Keypair) -> Result<(), TransactionError> {
        let balance = balance_pda(&key(owner));
        let ix = ix(
            instruction::DelegateBalance {},
            accounts::DelegateBalance {
                owner: key(owner),
                buffer_balance: delegate_buffer_pda_from_delegated_account_and_owner_program(
                    &balance,
                    &sirenrun::ID,
                ),
                delegation_record_balance: delegation_record_pda_from_delegated_account(&balance),
                delegation_metadata_balance: delegation_metadata_pda_from_delegated_account(
                    &balance,
                ),
                balance,
                owner_program: sirenrun::ID,
                delegation_program: DelegationProgram::id(),
                system_program: system_program::ID,
            },
        );
        let validator = self.svm.validator_identity();
        self.send(Base, owner, with_validator(ix, validator))
    }

    pub fn undelegate_balance(
        &mut self,
        signer: &Keypair,
        owner: &Pubkey,
    ) -> Result<(), TransactionError> {
        let ix = ix(
            instruction::UndelegateBalance {},
            accounts::UndelegateBalance {
                signer: key(signer),
                session_token: None,
                balance: balance_pda(owner),
                magic_program: MagicProgram::id(),
                magic_context: MAGIC_CONTEXT_ID,
            },
        );
        self.send(Ephemeral, signer, ix)
    }

    pub fn init_arena(&mut self, signer: &Keypair, id: u8) -> Result<(), TransactionError> {
        let ix = ix(
            instruction::InitArena { id },
            accounts::InitArena {
                admin: key(signer),
                config: self.config,
                arena: arena_pda(id),
                system_program: system_program::ID,
            },
        );
        self.send(Base, signer, ix)
    }

    pub fn delegate_arena(&mut self, id: u8) -> Result<(), TransactionError> {
        let admin = self.admin.insecure_clone();
        let arena = arena_pda(id);
        let ix = ix(
            instruction::DelegateArena { id },
            accounts::DelegateArena {
                admin: key(&admin),
                config: self.config,
                buffer_arena: delegate_buffer_pda_from_delegated_account_and_owner_program(
                    &arena,
                    &sirenrun::ID,
                ),
                delegation_record_arena: delegation_record_pda_from_delegated_account(&arena),
                delegation_metadata_arena: delegation_metadata_pda_from_delegated_account(&arena),
                arena,
                owner_program: sirenrun::ID,
                delegation_program: DelegationProgram::id(),
                system_program: system_program::ID,
            },
        );
        let validator = self.svm.validator_identity();
        self.send(Base, &admin, with_validator(ix, validator))
    }

    /// Funds the user, delegates user and house balances and arena 0 to the ER.
    pub fn ready_for_runs(&mut self, deposit: u64) {
        let (admin, user) = (self.admin.insecure_clone(), self.user.insecure_clone());
        self.deposit(deposit).expect("deposit");
        self.delegate_balance(&user).expect("delegate user balance");
        self.init_balance(&admin).expect("init house balance");
        self.delegate_balance(&admin)
            .expect("delegate house balance");
        self.init_arena(&admin, 0).expect("init_arena");
        self.delegate_arena(0).expect("delegate_arena");
    }

    pub fn start_run(
        &mut self,
        signer: &Keypair,
        runner: &Pubkey,
        id: u8,
    ) -> Result<(), TransactionError> {
        let ix = ix(
            instruction::StartRun {},
            accounts::StartRun {
                signer: key(signer),
                session_token: None,
                runner_balance: balance_pda(runner),
                house_balance: balance_pda(&key(&self.admin)),
                config: self.config,
                arena: arena_pda(id),
                program_identity: program_identity_pubkey(&sirenrun::ID),
                oracle_queue: DEFAULT_EPHEMERAL_QUEUE,
                magic_program: MagicProgram::id(),
                vrf_program: VRF_PROGRAM_ID,
                slot_hashes: SLOT_HASHES,
                system_program: system_program::ID,
            },
        );
        self.send(Ephemeral, signer, ix)
    }

    pub fn set_input(
        &mut self,
        signer: &Keypair,
        id: u8,
        target_lane: u8,
        nitro: bool,
    ) -> Result<(), TransactionError> {
        let ix = ix(
            instruction::SetInput { target_lane, nitro },
            accounts::SetInput {
                signer: key(signer),
                session_token: None,
                arena: arena_pda(id),
            },
        );
        self.send(Ephemeral, signer, ix)
    }

    /// Sends `tick` without the crank: `signer` stands in for the crank signer PDA.
    pub fn tick_directly(
        &mut self,
        signer: &Keypair,
        id: u8,
        nonce: u32,
    ) -> Result<(), TransactionError> {
        let arena = self.arena(Ephemeral, id);
        let ix = ix(
            instruction::Tick { nonce },
            accounts::Tick {
                arena: arena_pda(id),
                runner_balance: balance_pda(&arena.runner),
                house_balance: balance_pda(&key(&self.admin)),
                config: self.config,
                crank_signer: key(signer),
            },
        );
        self.send(Ephemeral, signer, ix)
    }

    /// Advances one slot, running any due VRF callbacks and crank ticks; fails on any error.
    /// Returns the compute units of each scheduled transaction that ran.
    pub fn advance_slot(&mut self) -> Vec<u64> {
        let slot = self.svm.get_sysvar::<Clock>().slot;
        self.svm
            .warp_to_slot(slot + 1)
            .into_iter()
            .map(|result| match result {
                Ok(meta) => meta.compute_units_consumed,
                Err(failed) => panic!(
                    "scheduled tx failed: {:?}\nlogs: {:#?}",
                    failed.err, failed.meta.logs
                ),
            })
            .collect()
    }

    pub fn balance(&self, target: TransactionTarget, owner: &Pubkey) -> Balance {
        self.decode(target, balance_pda(owner))
    }

    pub fn arena(&self, target: TransactionTarget, id: u8) -> Arena {
        self.decode(target, arena_pda(id))
    }

    pub fn decode<T: AccountDeserialize>(&self, target: TransactionTarget, account: Pubkey) -> T {
        let data = self
            .svm
            .get_account_for(target, &address(account))
            .unwrap_or_else(|| panic!("missing {account} on {target:?}"))
            .data;
        T::try_deserialize(&mut data.as_slice()).expect("decode account")
    }

    pub fn token_amount(&self, account: Pubkey) -> u64 {
        let data = self
            .svm
            .get_account_for(Base, &address(account))
            .expect("token account")
            .data;
        u64::from_le_bytes(data[64..72].try_into().unwrap())
    }

    pub fn is_delegated(&self, account: Pubkey) -> bool {
        self.svm
            .get_account_for(Base, &address(account))
            .is_some_and(|a| a.owner == DELEGATION_PROGRAM_ID)
    }
}
