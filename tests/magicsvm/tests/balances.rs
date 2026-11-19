use anchor_lang::prelude::Pubkey;
use anchor_lang::{system_program, AccountDeserialize, Id, InstructionData, ToAccountMetas};
use anchor_spl::token::Token;
use ephemeral_rollups_sdk::anchor::{DelegationProgram, MagicProgram};
use ephemeral_rollups_sdk::consts::{DELEGATION_PROGRAM_ID, MAGIC_CONTEXT_ID};
use ephemeral_rollups_sdk::pda::{
    delegate_buffer_pda_from_delegated_account_and_owner_program,
    delegation_metadata_pda_from_delegated_account, delegation_record_pda_from_delegated_account,
};
use magicsvm::{MagicSVM, TransactionTarget};
use sirenrun::errors::SirenrunError;
use sirenrun::state::{Balance, Config, ConfigParams, BALANCE_SEED, CONFIG_SEED, VAULT_SEED};
use sirenrun::{accounts, instruction};
use solana_account::Account;
use solana_address::Address;
use solana_instruction::error::InstructionError;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;
use solana_transaction_error::TransactionError;

const DECIMALS: u8 = 6;
const TUSDC: u64 = 1_000_000;
const ACCOUNT_OWNED_BY_WRONG_PROGRAM: u32 = 3007;

const SPL_MINT_LEN: usize = 82;
const SPL_TOKEN_ACCOUNT_LEN: usize = 165;

fn address(pubkey: Pubkey) -> Address {
    Address::new_from_array(pubkey.to_bytes())
}

fn pubkey(address: Address) -> Pubkey {
    Pubkey::new_from_array(address.to_bytes())
}

fn program_id() -> Pubkey {
    sirenrun::ID
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &program_id()).0
}

fn ix(data: impl InstructionData, accounts: impl ToAccountMetas) -> Instruction {
    Instruction {
        program_id: address(program_id()),
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

fn token_amount(svm: &MagicSVM, account: Pubkey) -> u64 {
    let data = svm
        .get_account_for(TransactionTarget::Base, &address(account))
        .expect("token account")
        .data;
    u64::from_le_bytes(data[64..72].try_into().unwrap())
}

struct World {
    svm: MagicSVM,
    admin: Keypair,
    user: Keypair,
    mint: Pubkey,
    user_token: Pubkey,
    config: Pubkey,
    vault: Pubkey,
    balance: Pubkey,
}

impl World {
    fn new() -> Self {
        let mut svm = MagicSVM::new();
        let so = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/deploy/sirenrun.so"
        );
        svm.add_program_from_file(address(program_id()), so)
            .expect("load sirenrun.so; run `anchor build` first");

        let admin = Keypair::new();
        let user = Keypair::new();
        for k in [&admin, &user] {
            svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
        }

        let mint = Pubkey::new_unique();
        let user_token = Pubkey::new_unique();
        let user_key = pubkey(user.pubkey());
        let token_program = address(Token::id());
        let rent = |len: usize| svm.minimum_balance_for_rent_exemption(len);
        let (mint_rent, token_rent) = (rent(SPL_MINT_LEN), rent(SPL_TOKEN_ACCOUNT_LEN));
        svm.set_account(
            address(mint),
            Account {
                lamports: mint_rent,
                data: mint_data(pubkey(admin.pubkey()), 100 * TUSDC),
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
                data: token_account_data(mint, user_key, 100 * TUSDC),
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
            balance: pda(&[BALANCE_SEED, user_key.as_ref()]),
        }
    }

    fn send(
        &mut self,
        target: TransactionTarget,
        signer: &Keypair,
        instruction: Instruction,
    ) -> Result<(), TransactionError> {
        let message = Message::new(&[instruction], Some(&signer.pubkey()));
        let tx = Transaction::new(&[signer], message, self.svm.latest_blockhash_for(target));
        let result = self
            .svm
            .send_transaction_to(target, tx)
            .map(|_| ())
            .map_err(|f| f.err);
        self.svm.expire_blockhash_for(target);
        result
    }

    fn params(&self) -> ConfigParams {
        ConfigParams {
            house: pubkey(self.admin.pubkey()),
            fee_bps: 200,
            runner_fee_bps: 100,
            entry_fee: TUSDC,
            bond: 25 * TUSDC,
            liquidity: 50 * TUSDC,
            max_buy: 50 * TUSDC,
        }
    }

    fn init_config(&mut self) -> Result<(), TransactionError> {
        let admin = self.admin.insecure_clone();
        let ix = ix(
            instruction::InitConfig {
                params: self.params(),
            },
            accounts::InitConfig {
                admin: pubkey(admin.pubkey()),
                config: self.config,
                mint: self.mint,
                vault: self.vault,
                token_program: Token::id(),
                system_program: system_program::ID,
            },
        );
        self.send(TransactionTarget::Base, &admin, ix)
    }

    fn update_config(
        &mut self,
        signer: &Keypair,
        params: ConfigParams,
    ) -> Result<(), TransactionError> {
        let ix = ix(
            instruction::UpdateConfig { params },
            accounts::UpdateConfig {
                admin: pubkey(signer.pubkey()),
                config: self.config,
            },
        );
        self.send(TransactionTarget::Base, signer, ix)
    }

    fn init_balance(&mut self) -> Result<(), TransactionError> {
        let user = self.user.insecure_clone();
        let ix = ix(
            instruction::InitBalance {},
            accounts::InitBalance {
                owner: pubkey(user.pubkey()),
                balance: self.balance,
                system_program: system_program::ID,
            },
        );
        self.send(TransactionTarget::Base, &user, ix)
    }

    fn deposit(&mut self, amount: u64) -> Result<(), TransactionError> {
        let user = self.user.insecure_clone();
        let ix = ix(
            instruction::Deposit { amount },
            accounts::Deposit {
                owner: pubkey(user.pubkey()),
                balance: self.balance,
                config: self.config,
                mint: self.mint,
                owner_token: self.user_token,
                vault: self.vault,
                token_program: Token::id(),
            },
        );
        self.send(TransactionTarget::Base, &user, ix)
    }

    fn withdraw(&mut self, amount: u64) -> Result<(), TransactionError> {
        let user = self.user.insecure_clone();
        let ix = ix(
            instruction::Withdraw { amount },
            accounts::Withdraw {
                owner: pubkey(user.pubkey()),
                balance: self.balance,
                config: self.config,
                mint: self.mint,
                owner_token: self.user_token,
                vault: self.vault,
                token_program: Token::id(),
            },
        );
        self.send(TransactionTarget::Base, &user, ix)
    }

    fn delegate_balance(&mut self) -> Result<(), TransactionError> {
        let user = self.user.insecure_clone();
        let mut ix = ix(
            instruction::DelegateBalance {},
            accounts::DelegateBalance {
                owner: pubkey(user.pubkey()),
                buffer_balance: delegate_buffer_pda_from_delegated_account_and_owner_program(
                    &self.balance,
                    &program_id(),
                ),
                delegation_record_balance: delegation_record_pda_from_delegated_account(
                    &self.balance,
                ),
                delegation_metadata_balance: delegation_metadata_pda_from_delegated_account(
                    &self.balance,
                ),
                balance: self.balance,
                owner_program: program_id(),
                delegation_program: DelegationProgram::id(),
                system_program: system_program::ID,
            },
        );
        let validator = self.svm.validator_identity();
        ix.accounts
            .push(AccountMeta::new_readonly(validator, false));
        self.send(TransactionTarget::Base, &user, ix)
    }

    fn undelegate_balance(&mut self, signer: &Keypair) -> Result<(), TransactionError> {
        let ix = ix(
            instruction::UndelegateBalance {},
            accounts::UndelegateBalance {
                signer: pubkey(signer.pubkey()),
                session_token: None,
                balance: self.balance,
                magic_program: MagicProgram::id(),
                magic_context: MAGIC_CONTEXT_ID,
            },
        );
        self.send(TransactionTarget::Ephemeral, signer, ix)
    }

    fn balance_on(&self, target: TransactionTarget) -> Balance {
        let account = self
            .svm
            .get_account_for(target, &address(self.balance))
            .expect("balance account");
        Balance::try_deserialize(&mut account.data.as_slice()).expect("decode balance")
    }

    fn is_delegated(&self) -> bool {
        self.svm
            .get_account_for(TransactionTarget::Base, &address(self.balance))
            .is_some_and(|a| a.owner == DELEGATION_PROGRAM_ID)
    }
}

fn custom_code(err: Result<(), TransactionError>) -> u32 {
    match err {
        Err(TransactionError::InstructionError(_, InstructionError::Custom(code))) => code,
        other => panic!("expected a custom program error, got {other:?}"),
    }
}

fn ready_world() -> World {
    let mut world = World::new();
    world.init_config().expect("init_config");
    world.init_balance().expect("init_balance");
    world
}

#[test]
fn init_config_stores_params_and_creates_vault() {
    let world = ready_world();
    let data = world
        .svm
        .get_account_for(TransactionTarget::Base, &address(world.config))
        .unwrap()
        .data;
    let config = Config::try_deserialize(&mut data.as_slice()).unwrap();
    assert_eq!(config.admin, pubkey(world.admin.pubkey()));
    assert_eq!(config.mint, world.mint);
    assert_eq!(config.vault, world.vault);
    assert_eq!(config.max_buy, 50 * TUSDC);
    assert_eq!(token_amount(&world.svm, world.vault), 0);
}

#[test]
fn update_config_is_admin_only_and_validated() {
    let mut world = ready_world();
    let stranger = Keypair::new();
    world
        .svm
        .airdrop(&stranger.pubkey(), 1_000_000_000)
        .unwrap();
    let params = ConfigParams {
        max_buy: 10 * TUSDC,
        ..world.params()
    };

    let code = custom_code(world.update_config(&stranger, params));
    assert_eq!(code, u32::from(SirenrunError::Unauthorized));

    let admin = world.admin.insecure_clone();
    let bad = ConfigParams {
        runner_fee_bps: 500,
        ..world.params()
    };
    assert_eq!(
        custom_code(world.update_config(&admin, bad)),
        u32::from(SirenrunError::InvalidConfig)
    );

    world.update_config(&admin, params).expect("admin update");
}

#[test]
fn money_round_trip_through_the_rollup() {
    let mut world = ready_world();

    world.deposit(40 * TUSDC).expect("deposit");
    world.withdraw(10 * TUSDC).expect("withdraw");
    assert_eq!(
        custom_code(world.withdraw(31 * TUSDC)),
        u32::from(SirenrunError::InsufficientBalance)
    );
    assert_eq!(
        world.balance_on(TransactionTarget::Base).available,
        30 * TUSDC
    );
    assert_eq!(token_amount(&world.svm, world.vault), 30 * TUSDC);
    assert_eq!(token_amount(&world.svm, world.user_token), 70 * TUSDC);

    world.delegate_balance().expect("delegate_balance");
    assert!(world.is_delegated());
    assert_eq!(
        world.balance_on(TransactionTarget::Ephemeral).available,
        30 * TUSDC
    );

    assert_eq!(
        custom_code(world.deposit(TUSDC)),
        ACCOUNT_OWNED_BY_WRONG_PROGRAM
    );
    assert_eq!(
        custom_code(world.withdraw(TUSDC)),
        ACCOUNT_OWNED_BY_WRONG_PROGRAM
    );

    let stranger = Keypair::new();
    world
        .svm
        .airdrop(&stranger.pubkey(), 1_000_000_000)
        .unwrap();
    assert_eq!(
        custom_code(world.undelegate_balance(&stranger)),
        u32::from(SirenrunError::Unauthorized)
    );

    let user = world.user.insecure_clone();
    world.undelegate_balance(&user).expect("undelegate_balance");
    assert!(!world.is_delegated());
    assert_eq!(
        world.balance_on(TransactionTarget::Base).available,
        30 * TUSDC
    );

    world.withdraw(30 * TUSDC).expect("final withdraw");
    assert_eq!(world.balance_on(TransactionTarget::Base).available, 0);
    assert_eq!(token_amount(&world.svm, world.vault), 0);
    assert_eq!(token_amount(&world.svm, world.user_token), 100 * TUSDC);
}
