//! Vectors for the write side of `packages/sdk`: every instruction a client sends, encoded
//! by the program crate (and the session-keys crate), the events the program emits, and
//! claim outcomes from `Arena::claim`.

use anchor_lang::prelude::{AccountMeta, Pubkey};
use anchor_lang::{pubkey, system_program, Event, InstructionData, ToAccountMetas};
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token;
use ephemeral_rollups_sdk::consts::{MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID};
use ephemeral_rollups_sdk::cpi::DELEGATION_PROGRAM_ID;
use ephemeral_rollups_sdk::pda::{
    delegate_buffer_pda_from_delegated_account_and_owner_program,
    delegation_metadata_pda_from_delegated_account, delegation_record_pda_from_delegated_account,
};
use ephemeral_rollups_sdk::vrf::consts::{
    program_identity_pubkey, DEFAULT_EPHEMERAL_QUEUE, VRF_PROGRAM_ID,
};
use serde_json::{json, Value};
use session_keys::SessionTokenV2;
use sirenrun::constants::{LINES, MAX_ENTRIES};
use sirenrun::instructions::{
    Claimed, LineCrossed, NitroUsed, RunSettled, RunStarted, SeedSet, Trade,
};
use sirenrun::sim::SimState;
use sirenrun::state::{
    Arena, ArenaStatus, Balance, ConfigParams, Market, MarketStatus, PositionEntry, RunResult,
    Side, ARENA_SEED, BALANCE_SEED, CONFIG_SEED, MARKETS, RESULTS, VAULT_SEED,
};
use sirenrun::{accounts, instruction};
use std::path::PathBuf;

const ASIA_VALIDATOR: Pubkey = pubkey!("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57");
const SLOT_HASHES: Pubkey = pubkey!("SysvarS1otHashes111111111111111111111111111");
const VALID_UNTIL: i64 = 1_800_000_000;

fn vectors_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packages/test-vectors/client.json")
}

fn key(byte: u8) -> Pubkey {
    Pubkey::new_from_array([byte; 32])
}

const ADMIN: u8 = 1;
const HOUSE: u8 = 2;
const USER: u8 = 3;
const SESSION_SIGNER: u8 = 5;
const MINT: u8 = 7;

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &sirenrun::ID).0
}

fn balance_pda(owner: &Pubkey) -> Pubkey {
    pda(&[BALANCE_SEED, owner.as_ref()])
}

fn arena_pda(id: u8) -> Pubkey {
    pda(&[ARENA_SEED, &[id]])
}

fn session_token(signer: &Pubkey, authority: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            SessionTokenV2::SEED_PREFIX.as_bytes(),
            sirenrun::ID.as_ref(),
            signer.as_ref(),
            authority.as_ref(),
        ],
        &session_keys::ID,
    )
    .0
}

fn metas_json(metas: &[AccountMeta]) -> Value {
    metas
        .iter()
        .map(|m| {
            json!({
                "pubkey": m.pubkey.to_string(),
                "isSigner": m.is_signer,
                "isWritable": m.is_writable,
            })
        })
        .collect()
}

/// One vector: `args` is what the TS test passes to the builder named `name`.
fn case(
    name: &str,
    layer: &str,
    args: Value,
    program: Pubkey,
    data: Vec<u8>,
    metas: Vec<AccountMeta>,
) -> Value {
    json!({
        "name": name,
        "layer": layer,
        "args": args,
        "programId": program.to_string(),
        "keys": metas_json(&metas),
        "data": hex(&data),
    })
}

fn sirenrun_case(
    name: &str,
    layer: &str,
    args: Value,
    data: impl InstructionData,
    accounts: impl ToAccountMetas,
) -> Value {
    let metas = accounts.to_account_metas(None);
    case(name, layer, args, sirenrun::ID, data.data(), metas)
}

fn with_validator(mut case: Value) -> Value {
    let keys = case["keys"].as_array_mut().expect("keys");
    keys.push(json!({
        "pubkey": ASIA_VALIDATOR.to_string(),
        "isSigner": false,
        "isWritable": false,
    }));
    case
}

fn base_instructions() -> Vec<Value> {
    let (admin, house, user, mint) = (key(ADMIN), key(HOUSE), key(USER), key(MINT));
    let config = pda(&[CONFIG_SEED]);
    let vault = pda(&[VAULT_SEED]);
    let params = ConfigParams {
        house,
        fee_bps: 200,
        runner_fee_bps: 100,
        entry_fee: 1_000_000,
        bond: 25_000_000,
        liquidity: 50_000_000,
        max_buy: u64::MAX,
        nitro_fee: 500_000,
        open_bps: [8_500, 4_500, 1_500],
    };
    let params_json = json!({
        "house": house.to_string(),
        "feeBps": 200,
        "runnerFeeBps": 100,
        "entryFee": "1000000",
        "bond": "25000000",
        "liquidity": "50000000",
        "maxBuy": u64::MAX.to_string(),
        "nitroFee": "500000",
        "openBps": [8_500, 4_500, 1_500],
    });
    let user_token = get_associated_token_address(&user, &mint);
    let other_token = key(9);
    let balance = balance_pda(&user);
    let arena = arena_pda(1);

    vec![
        sirenrun_case(
            "initConfig",
            "base",
            json!({ "admin": admin.to_string(), "mint": mint.to_string(), "params": params_json }),
            instruction::InitConfig { params },
            accounts::InitConfig {
                admin,
                config,
                mint,
                vault,
                token_program: token::ID,
                system_program: system_program::ID,
            },
        ),
        sirenrun_case(
            "updateConfig",
            "base",
            json!({ "admin": admin.to_string(), "params": params_json }),
            instruction::UpdateConfig { params },
            accounts::UpdateConfig { admin, config },
        ),
        sirenrun_case(
            "initBalance",
            "base",
            json!({ "owner": user.to_string() }),
            instruction::InitBalance {},
            accounts::InitBalance {
                owner: user,
                balance,
                system_program: system_program::ID,
            },
        ),
        sirenrun_case(
            "deposit",
            "base",
            json!({ "owner": user.to_string(), "mint": mint.to_string(), "amount": "12500000" }),
            instruction::Deposit { amount: 12_500_000 },
            accounts::Deposit {
                owner: user,
                balance,
                config,
                mint,
                owner_token: user_token,
                vault,
                token_program: token::ID,
            },
        ),
        sirenrun_case(
            "withdraw",
            "base",
            json!({
                "owner": user.to_string(),
                "mint": mint.to_string(),
                "amount": u64::MAX.to_string(),
                "ownerToken": other_token.to_string(),
            }),
            instruction::Withdraw { amount: u64::MAX },
            accounts::Withdraw {
                owner: user,
                balance,
                config,
                mint,
                owner_token: other_token,
                vault,
                token_program: token::ID,
            },
        ),
        with_validator(sirenrun_case(
            "delegateBalance",
            "base",
            json!({ "owner": user.to_string(), "validator": ASIA_VALIDATOR.to_string() }),
            instruction::DelegateBalance {},
            accounts::DelegateBalance {
                owner: user,
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
                delegation_program: DELEGATION_PROGRAM_ID,
                system_program: system_program::ID,
            },
        )),
        sirenrun_case(
            "initArena",
            "base",
            json!({ "admin": admin.to_string(), "id": 1 }),
            instruction::InitArena { id: 1 },
            accounts::InitArena {
                admin,
                config,
                arena,
                system_program: system_program::ID,
            },
        ),
        with_validator(sirenrun_case(
            "delegateArena",
            "base",
            json!({ "admin": admin.to_string(), "id": 1, "validator": ASIA_VALIDATOR.to_string() }),
            instruction::DelegateArena { id: 1 },
            accounts::DelegateArena {
                admin,
                config,
                buffer_arena: delegate_buffer_pda_from_delegated_account_and_owner_program(
                    &arena,
                    &sirenrun::ID,
                ),
                delegation_record_arena: delegation_record_pda_from_delegated_account(&arena),
                delegation_metadata_arena: delegation_metadata_pda_from_delegated_account(&arena),
                arena,
                owner_program: sirenrun::ID,
                delegation_program: DELEGATION_PROGRAM_ID,
                system_program: system_program::ID,
            },
        )),
    ]
}

/// ER instructions, once signed by the wallet itself and once by a session key.
fn er_instructions() -> Vec<Value> {
    let (house, user, session) = (key(HOUSE), key(USER), key(SESSION_SIGNER));
    let config = pda(&[CONFIG_SEED]);
    let token = session_token(&session, &user);
    let auths = [
        (user, None, json!({ "signer": user.to_string() })),
        (
            session,
            Some(token),
            json!({ "signer": session.to_string(), "sessionToken": token.to_string() }),
        ),
    ];

    let mut cases = Vec::new();
    for (signer, session_token, auth) in auths {
        let suffix = if session_token.is_some() {
            " (session)"
        } else {
            ""
        };
        let name = |n: &str| format!("{n}{suffix}");
        cases.push(sirenrun_case(
            &name("startRun"),
            "er",
            json!({
                "auth": auth,
                "runner": user.to_string(),
                "house": house.to_string(),
                "id": 0,
                "oracleQueue": DEFAULT_EPHEMERAL_QUEUE.to_string(),
            }),
            instruction::StartRun {},
            accounts::StartRun {
                signer,
                session_token,
                runner_balance: balance_pda(&user),
                house_balance: balance_pda(&house),
                config,
                arena: arena_pda(0),
                program_identity: program_identity_pubkey(&sirenrun::ID),
                oracle_queue: DEFAULT_EPHEMERAL_QUEUE,
                magic_program: MAGIC_PROGRAM_ID,
                vrf_program: VRF_PROGRAM_ID,
                slot_hashes: SLOT_HASHES,
                system_program: system_program::ID,
            },
        ));
        cases.push(sirenrun_case(
            &name("setInput"),
            "er",
            json!({ "auth": auth, "id": 2, "targetLane": 4, "nitro": true }),
            instruction::SetInput {
                target_lane: 4,
                nitro: true,
            },
            accounts::SetInput {
                signer,
                session_token,
                arena: arena_pda(2),
            },
        ));
        cases.push(sirenrun_case(
            &name("buy"),
            "er",
            json!({
                "auth": auth,
                "owner": user.to_string(),
                "house": house.to_string(),
                "id": 1,
                "market": 2,
                "side": "no",
                "amount": "5000000",
                "minShares": "9000000",
            }),
            instruction::Buy {
                market: 2,
                side: Side::No,
                amount: 5_000_000,
                min_shares: 9_000_000,
            },
            accounts::Buy {
                signer,
                session_token,
                trader_balance: balance_pda(&user),
                house_balance: balance_pda(&house),
                config,
                arena: arena_pda(1),
            },
        ));
        cases.push(sirenrun_case(
            &name("claim"),
            "er",
            json!({
                "auth": auth,
                "owner": user.to_string(),
                "house": house.to_string(),
                "id": 1,
                "entryIndex": 7,
            }),
            instruction::Claim { entry_index: 7 },
            accounts::Claim {
                signer,
                session_token,
                trader_balance: balance_pda(&user),
                house_balance: balance_pda(&house),
                config,
                arena: arena_pda(1),
            },
        ));
        cases.push(sirenrun_case(
            &name("undelegateBalance"),
            "er",
            json!({ "auth": auth, "owner": user.to_string() }),
            instruction::UndelegateBalance {},
            accounts::UndelegateBalance {
                signer,
                session_token,
                balance: balance_pda(&user),
                config,
                arena_0: arena_pda(0),
                arena_1: arena_pda(1),
                arena_2: arena_pda(2),
                magic_program: MAGIC_PROGRAM_ID,
                magic_context: MAGIC_CONTEXT_ID,
            },
        ));
    }
    cases.push(sirenrun_case(
        "recoverArena",
        "er",
        json!({ "admin": key(ADMIN).to_string(), "id": 0 }),
        instruction::RecoverArena {},
        accounts::RecoverArena {
            admin: key(ADMIN),
            config,
            arena: arena_pda(0),
        },
    ));
    cases.push(sirenrun_case(
        "buy (yes)",
        "er",
        json!({
            "auth": { "signer": user.to_string() },
            "owner": user.to_string(),
            "house": house.to_string(),
            "id": 0,
            "market": 0,
            "side": "yes",
            "amount": "1",
            "minShares": "0",
        }),
        instruction::Buy {
            market: 0,
            side: Side::Yes,
            amount: 1,
            min_shares: 0,
        },
        accounts::Buy {
            signer: user,
            session_token: None,
            trader_balance: balance_pda(&user),
            house_balance: balance_pda(&house),
            config,
            arena: arena_pda(0),
        },
    ));
    cases
}

fn session_instructions() -> Vec<Value> {
    let (user, signer) = (key(USER), key(SESSION_SIGNER));
    let token = session_token(&signer, &user);
    let create = |name: &str, lamports: Option<u64>| {
        let data = session_keys::instruction::CreateSessionV2 {
            top_up: Some(lamports.is_some()),
            valid_until: Some(VALID_UNTIL),
            lamports,
        };
        let metas = session_keys::accounts::CreateSessionTokenV2 {
            session_token: token,
            session_signer: signer,
            fee_payer: user,
            authority: user,
            target_program: sirenrun::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);
        let args = json!({
            "authority": user.to_string(),
            "sessionSigner": signer.to_string(),
            "validUntil": VALID_UNTIL,
            "topUpLamports": lamports.map(|l| l.to_string()),
        });
        case(name, "base", args, session_keys::ID, data.data(), metas)
    };

    let mut revoke_metas = session_keys::accounts::RevokeSessionTokenV2 {
        session_token: token,
        fee_payer: user,
        authority: user,
        system_program: system_program::ID,
    }
    .to_account_metas(None);
    // The program requires the authority's signature while the session is still valid,
    // which the account struct cannot express, so the client marks it.
    for meta in &mut revoke_metas {
        if meta.pubkey == user {
            meta.is_signer = true;
        }
    }
    let revoke = case(
        "revokeSession",
        "base",
        json!({ "authority": user.to_string(), "sessionSigner": signer.to_string() }),
        session_keys::ID,
        session_keys::instruction::RevokeSessionV2 {}.data(),
        revoke_metas,
    );

    vec![
        create("createSession", None),
        create("createSession (top up)", Some(2_000_000)),
        revoke,
    ]
}

fn events() -> Value {
    let arena = arena_pda(1);
    let event = |name: &str, bytes: Vec<u8>, fields: Value| json!({ "name": name, "hex": hex(&bytes), "fields": fields });
    let runner = key(USER);
    json!([
        event(
            "RunStarted",
            RunStarted {
                arena,
                nonce: 7,
                runner,
                entry_fee: 1_000_000,
                bond: 25_000_000,
            }
            .data(),
            json!({
                "arena": arena.to_string(),
                "nonce": 7,
                "runner": runner.to_string(),
                "entryFee": "1000000",
                "bond": "25000000",
            }),
        ),
        event(
            "SeedSet",
            SeedSet { arena, nonce: 7 }.data(),
            json!({ "arena": arena.to_string(), "nonce": 7 }),
        ),
        event(
            "Trade",
            Trade {
                arena,
                nonce: 7,
                market: 1,
                side: Side::No,
                net: 4_900_000,
                shares: 9_123_456,
                yes_r: u64::MAX,
                no_r: 54_900_000,
                owner: runner,
                amount: 5_000_000,
            }
            .data(),
            json!({
                "arena": arena.to_string(),
                "nonce": 7,
                "market": 1,
                "side": "no",
                "net": "4900000",
                "shares": "9123456",
                "yesR": u64::MAX.to_string(),
                "noR": "54900000",
                "owner": runner.to_string(),
                "amount": "5000000",
            }),
        ),
        event(
            "LineCrossed",
            LineCrossed {
                arena,
                nonce: 7,
                market: 0,
                t: 300,
            }
            .data(),
            json!({ "arena": arena.to_string(), "nonce": 7, "market": 0, "t": 300 }),
        ),
        event(
            "RunSettled",
            RunSettled {
                arena,
                nonce: 7,
                t: 451,
                outcomes: 0b10_10_01,
                runner,
                runner_fees: 120_000,
                runner_paid: 19_120_000,
            }
            .data(),
            json!({
                "arena": arena.to_string(),
                "nonce": 7,
                "t": 451,
                "outcomes": ["yes", "no", "no"],
                "runner": runner.to_string(),
                "runnerFees": "120000",
                "runnerPaid": "19120000",
            }),
        ),
        event(
            "NitroUsed",
            NitroUsed {
                arena,
                nonce: 7,
                runner,
                fee: 500_000,
            }
            .data(),
            json!({
                "arena": arena.to_string(),
                "nonce": 7,
                "runner": runner.to_string(),
                "fee": "500000",
            }),
        ),
        event(
            "Claimed",
            Claimed {
                owner: runner,
                arena,
                nonce: 7,
                market: 2,
                paid: 12_000_001,
            }
            .data(),
            json!({
                "owner": runner.to_string(),
                "arena": arena.to_string(),
                "nonce": 7,
                "market": 2,
                "paid": "12000001",
            }),
        ),
    ])
}

fn claim_arena() -> Arena {
    let outcomes = [
        (MarketStatus::Yes, 300),
        (MarketStatus::Open, 0),
        (MarketStatus::Void, 302),
    ];
    let mut markets = [Market::default(); MARKETS];
    for (i, market) in markets.iter_mut().enumerate() {
        market.line = LINES[i] as u16;
        (market.status, market.resolved_tick) = outcomes[i];
    }
    let mut results = [RunResult::default(); RESULTS];
    results[3] = RunResult {
        nonce: 9,
        outcomes: 0b11_10_01,
        resolved_ticks: [300, 450, 450],
        ride_back_bps: [0, 2_500, 0],
    };
    Arena {
        id: 1,
        bump: 255,
        status: ArenaStatus::Live,
        phase_ticks: 0,
        nonce: 10,
        runner: key(4),
        seed_ready: true,
        seed: 1,
        sim: SimState::start().into(),
        bond: 25_000_000,
        runner_fees: 0,
        markets,
        results,
        results_head: 4,
    }
}

fn entry(arena_id: u8, nonce: u32, market: u8, side: u8, tick: u32) -> PositionEntry {
    PositionEntry {
        arena_id,
        nonce,
        market,
        side,
        shares: 18_000_000,
        cost: 9_800_000,
        tick,
    }
}

/// Room for a refunded winner to credit its shares back to the house.
const HOUSE_FUNDS: u64 = 1_000_000_000_000;

fn claims() -> Value {
    let arena = claim_arena();
    let cases = [
        ("win", entry(1, 10, 0, 1, 100), HOUSE_FUNDS),
        ("loss", entry(1, 10, 0, 2, 100), HOUSE_FUNDS),
        ("cooldown refund", entry(1, 10, 0, 1, 290), HOUSE_FUNDS),
        ("cooldown edge pays", entry(1, 10, 0, 1, 285), HOUSE_FUNDS),
        ("open market", entry(1, 10, 1, 1, 100), HOUSE_FUNDS),
        ("void refund", entry(1, 10, 2, 2, 100), HOUSE_FUNDS),
        ("older run win", entry(1, 9, 1, 2, 10), HOUSE_FUNDS),
        ("older run void", entry(1, 9, 2, 1, 10), HOUSE_FUNDS),
        (
            "bust refunds part of a losing ride",
            entry(1, 9, 1, 1, 10),
            HOUSE_FUNDS,
        ),
        (
            "house short for a ride refund",
            entry(1, 9, 1, 1, 10),
            2_449_999,
        ),
        ("expired", entry(1, 3, 0, 1, 10), HOUSE_FUNDS),
        ("other arena", entry(2, 10, 0, 1, 100), HOUSE_FUNDS),
        ("empty", PositionEntry::default(), HOUSE_FUNDS),
        ("bad market", entry(1, 10, 5, 1, 100), HOUSE_FUNDS),
        ("house short", entry(1, 10, 2, 1, 100), 9_799_999),
    ];
    let mut out = Vec::new();
    for (name, position, house_funds) in cases {
        let mut trader = Balance {
            owner: key(USER),
            available: 0,
            entries: [PositionEntry::default(); MAX_ENTRIES],
            bump: 255,
        };
        trader.entries[0] = position;
        let mut house = Balance {
            owner: key(HOUSE),
            available: house_funds,
            entries: [PositionEntry::default(); MAX_ENTRIES],
            bump: 255,
        };
        let result = match arena.claim(&mut trader, &mut house, 0) {
            Ok(paid) => json!({
                "kind": "ok",
                "paid": paid.to_string(),
                "houseDelta": (i128::from(house.available) - i128::from(house_funds)).to_string(),
            }),
            Err(anchor_lang::error::Error::AnchorError(e)) => {
                json!({ "kind": "error", "name": e.error_name })
            }
            Err(other) => panic!("unexpected error {other:?}"),
        };
        let side = ["empty", "yes", "no"][usize::from(position.side)];
        out.push(json!({
            "name": name,
            "entry": {
                "arenaId": position.arena_id,
                "nonce": position.nonce,
                "market": position.market,
                "side": side,
                "shares": position.shares.to_string(),
                "cost": position.cost.to_string(),
                "tick": position.tick,
            },
            "houseAvailable": house_funds.to_string(),
            "result": result,
        }));
    }
    json!({ "arena": hex(&arena_bytes(&arena)), "cases": out })
}

fn arena_bytes(arena: &Arena) -> Vec<u8> {
    let mut data = Vec::new();
    anchor_lang::AccountSerialize::try_serialize(arena, &mut data).expect("serialize");
    data
}

/// SPL token and ATA instructions the scripts and faucet use, built by the SPL crates.
fn token_instructions() -> Vec<Value> {
    use anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account_idempotent;
    use anchor_spl::token::spl_token::instruction::{
        initialize_mint2, mint_to_checked, set_authority, AuthorityType,
    };

    let (admin, user, mint) = (key(ADMIN), key(USER), key(MINT));
    let token_case =
        |name: &str, args: Value, ix: anchor_lang::solana_program::instruction::Instruction| {
            json!({
                "name": name,
                "layer": "base",
                "args": args,
                "programId": ix.program_id.to_string(),
                "keys": ix.accounts.iter().map(|m| json!({
                    "pubkey": m.pubkey.to_string(),
                    "isSigner": m.is_signer,
                    "isWritable": m.is_writable,
                })).collect::<Vec<_>>(),
                "data": hex(&ix.data),
            })
        };
    let ata = get_associated_token_address(&user, &mint);
    vec![
        token_case(
            "initializeMint",
            json!({ "mint": mint.to_string(), "authority": admin.to_string(), "decimals": 6 }),
            initialize_mint2(&token::ID, &mint, &admin, None, 6).expect("initialize_mint2"),
        ),
        token_case(
            "createAta",
            json!({ "payer": admin.to_string(), "owner": user.to_string(), "mint": mint.to_string() }),
            create_associated_token_account_idempotent(&admin, &user, &mint, &token::ID),
        ),
        token_case(
            "mintTo",
            json!({
                "mint": mint.to_string(),
                "destination": ata.to_string(),
                "authority": admin.to_string(),
                "amount": "100000000",
                "decimals": 6,
            }),
            mint_to_checked(&token::ID, &mint, &ata, &admin, &[], 100_000_000, 6).expect("mint_to"),
        ),
        token_case(
            "setMintAuthority",
            json!({ "mint": mint.to_string(), "current": admin.to_string(), "next": key(SESSION_SIGNER).to_string() }),
            set_authority(
                &token::ID,
                &mint,
                Some(&key(SESSION_SIGNER)),
                AuthorityType::MintTokens,
                &admin,
                &[],
            )
            .expect("set_authority"),
        ),
    ]
}

fn session_token_account() -> Value {
    let token = SessionTokenV2 {
        authority: key(USER),
        target_program: sirenrun::ID,
        session_signer: key(SESSION_SIGNER),
        fee_payer: key(USER),
        valid_until: VALID_UNTIL,
    };
    let mut data = Vec::new();
    anchor_lang::AccountSerialize::try_serialize(&token, &mut data).expect("serialize");
    json!({
        "address": session_token(&key(SESSION_SIGNER), &key(USER)).to_string(),
        "hex": hex(&data),
        "fields": {
            "authority": key(USER).to_string(),
            "targetProgram": sirenrun::ID.to_string(),
            "sessionSigner": key(SESSION_SIGNER).to_string(),
            "feePayer": key(USER).to_string(),
            "validUntil": VALID_UNTIL,
        },
    })
}

fn build_vectors() -> Value {
    let instructions: Vec<Value> = base_instructions()
        .into_iter()
        .chain(er_instructions())
        .chain(session_instructions())
        .chain(token_instructions())
        .collect();
    json!({
        "instructions": instructions,
        "events": events(),
        "claims": claims(),
        "sessionToken": session_token_account(),
    })
}

#[test]
fn committed_vectors_match_the_program() {
    let file = std::fs::read_to_string(vectors_path()).expect("read client.json");
    let committed: Value = serde_json::from_str(&file).expect("parse client.json");
    assert_eq!(
        committed,
        build_vectors(),
        "run `cargo test -p sirenrun --test sdk_client -- --ignored gen_vectors`"
    );
}

#[test]
fn every_client_instruction_has_a_vector() {
    let vectors = build_vectors();
    let names: Vec<&str> = vectors["instructions"]
        .as_array()
        .expect("instructions")
        .iter()
        .map(|c| c["name"].as_str().expect("name"))
        .collect();
    for name in [
        "initConfig",
        "updateConfig",
        "initBalance",
        "deposit",
        "withdraw",
        "delegateBalance",
        "initArena",
        "delegateArena",
        "startRun",
        "setInput",
        "buy",
        "claim",
        "undelegateBalance",
        "recoverArena",
        "createSession",
        "revokeSession",
    ] {
        assert!(names.contains(&name), "no vector for {name}");
    }
}

#[test]
#[ignore = "writes packages/test-vectors/client.json"]
fn gen_vectors() {
    let json = serde_json::to_string_pretty(&build_vectors()).expect("serialize");
    std::fs::write(vectors_path(), json + "\n").expect("write client.json");
}
