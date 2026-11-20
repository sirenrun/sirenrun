//! Vectors for `packages/sdk`: PDAs and account bytes produced by the program crate, so the
//! TypeScript client is checked against the real layout without a validator.

use anchor_lang::prelude::Pubkey;
use anchor_lang::AccountSerialize;
use anchor_spl::associated_token::get_associated_token_address;
use ephemeral_rollups_sdk::consts::{MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID};
use ephemeral_rollups_sdk::cpi::DELEGATION_PROGRAM_ID;
use ephemeral_rollups_sdk::vrf::consts::{
    DEFAULT_EPHEMERAL_QUEUE, DEFAULT_EPHEMERAL_TEST_QUEUE, VRF_PROGRAM_ID,
};
use serde_json::{json, Value};
use sirenrun::constants::LINES;
use sirenrun::state::{
    Arena, ArenaStatus, Balance, Config, Market, MarketStatus, PositionEntry, RunResult, RunSim,
    ARENA_SEED, BALANCE_SEED, CONFIG_SEED, MARKETS, RESULTS, VAULT_SEED,
};
use std::path::PathBuf;

fn vectors_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packages/test-vectors/sdk.json")
}

fn key(byte: u8) -> Pubkey {
    Pubkey::new_from_array([byte; 32])
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn account_hex<T: AccountSerialize>(account: &T) -> String {
    let mut data = Vec::new();
    account.try_serialize(&mut data).expect("serialize");
    hex(&data)
}

fn pda(seeds: &[&[u8]]) -> Value {
    let (address, bump) = Pubkey::find_program_address(seeds, &sirenrun::ID);
    json!({ "address": address.to_string(), "bump": bump })
}

fn pdas() -> Value {
    let owners: Vec<Value> = [key(1), key(2), key(200)]
        .iter()
        .map(|owner| {
            json!({
                "owner": owner.to_string(),
                "balance": pda(&[BALANCE_SEED, owner.as_ref()]),
                "ata": get_associated_token_address(owner, &key(7)).to_string(),
            })
        })
        .collect();
    let arenas: Vec<Value> = [0u8, 1, 2, u8::MAX]
        .into_iter()
        .map(|id| json!({ "id": id, "pda": pda(&[ARENA_SEED, &[id]]) }))
        .collect();
    json!({
        "programId": sirenrun::ID.to_string(),
        "mint": key(7).to_string(),
        "config": pda(&[CONFIG_SEED]),
        "vault": pda(&[VAULT_SEED]),
        "owners": owners,
        "arenas": arenas,
    })
}

fn sample_config() -> Config {
    Config {
        admin: key(1),
        mint: key(7),
        vault: key(8),
        house: key(2),
        fee_bps: 200,
        runner_fee_bps: 100,
        entry_fee: 1_000_000,
        bond: 25_000_000,
        liquidity: 50_000_000,
        max_buy: u64::MAX - 1,
        bump: 254,
        vault_bump: 253,
    }
}

fn config_fields(c: &Config) -> Value {
    json!({
        "admin": c.admin.to_string(),
        "mint": c.mint.to_string(),
        "vault": c.vault.to_string(),
        "house": c.house.to_string(),
        "feeBps": c.fee_bps,
        "runnerFeeBps": c.runner_fee_bps,
        "entryFee": c.entry_fee.to_string(),
        "bond": c.bond.to_string(),
        "liquidity": c.liquidity.to_string(),
        "maxBuy": c.max_buy.to_string(),
        "bump": c.bump,
        "vaultBump": c.vault_bump,
    })
}

fn sample_balance() -> Balance {
    let mut entries = [PositionEntry::default(); 8];
    entries[0] = PositionEntry {
        arena_id: 1,
        nonce: 70_000,
        market: 2,
        side: 1,
        shares: 12_345_678_901,
        cost: 9_800_000,
        tick: 412,
    };
    entries[3] = PositionEntry {
        arena_id: 2,
        nonce: u32::MAX,
        market: 0,
        side: 2,
        shares: u64::MAX,
        cost: 1,
        tick: u32::MAX,
    };
    Balance {
        owner: key(3),
        available: 9_007_199_254_740_993,
        entries,
        bump: 251,
    }
}

fn entry_side(side: u8) -> &'static str {
    match side {
        1 => "yes",
        2 => "no",
        _ => "empty",
    }
}

fn balance_fields(b: &Balance) -> Value {
    let entries: Vec<Value> = b
        .entries
        .iter()
        .map(|e| {
            json!({
                "arenaId": e.arena_id,
                "nonce": e.nonce,
                "market": e.market,
                "side": entry_side(e.side),
                "shares": e.shares.to_string(),
                "cost": e.cost.to_string(),
                "tick": e.tick,
            })
        })
        .collect();
    json!({
        "owner": b.owner.to_string(),
        "available": b.available.to_string(),
        "entries": entries,
        "bump": b.bump,
    })
}

fn sample_arena() -> Arena {
    let statuses = [MarketStatus::Yes, MarketStatus::Open, MarketStatus::Void];
    let mut markets = [Market::default(); MARKETS];
    for (i, market) in markets.iter_mut().enumerate() {
        market.line = LINES[i] as u16;
        market.status = statuses[i];
        market.yes_r = 50_000_000 + i as u64 * 7;
        market.no_r = 41_666_667 - i as u64 * 3;
        market.resolved_tick = if i == 1 { 0 } else { 300 + i as u32 };
    }
    let mut results = [RunResult::default(); RESULTS];
    results[0] = RunResult {
        nonce: 5,
        outcomes: 0b11_10_01,
        resolved_ticks: [300, 451, 451],
    };
    results[15] = RunResult {
        nonce: u32::MAX,
        outcomes: 0b10_10_10,
        resolved_ticks: [7, 7, 7],
    };
    Arena {
        id: 2,
        bump: 250,
        status: ArenaStatus::Live,
        phase_ticks: 77,
        nonce: 6,
        runner: key(4),
        seed_ready: true,
        seed: u64::MAX - 5,
        sim: RunSim {
            t: 301,
            car_x: 720,
            target_lane: 3,
            speed: 187,
            nitro_left: 1,
            nitro_ticks: 12,
            invuln: 4,
            distance: 4_000_123,
            row: 3_999,
            safe_lane: 4,
            police_gap: -17,
            busted: false,
            nitro_pressed: true,
        },
        bond: 25_000_000,
        no_profit_oi: 3_333_333,
        runner_fees: 98_765,
        markets,
        results,
        results_head: 1,
    }
}

fn market_status(status: MarketStatus) -> &'static str {
    match status {
        MarketStatus::Open => "open",
        MarketStatus::Yes => "yes",
        MarketStatus::No => "no",
        MarketStatus::Void => "void",
    }
}

fn arena_fields(a: &Arena) -> Value {
    let status = match a.status {
        ArenaStatus::Idle => "idle",
        ArenaStatus::Staging => "staging",
        ArenaStatus::Live => "live",
        ArenaStatus::Settled => "settled",
    };
    let s = a.sim;
    let markets: Vec<Value> = a
        .markets
        .iter()
        .map(|m| {
            json!({
                "line": m.line,
                "status": market_status(m.status),
                "yesR": m.yes_r.to_string(),
                "noR": m.no_r.to_string(),
                "resolvedTick": m.resolved_tick,
            })
        })
        .collect();
    let results: Vec<Value> = a
        .results
        .iter()
        .map(|r| {
            let outcomes: Vec<&str> = (0..MARKETS)
                .map(|i| market_status(MarketStatus::from_bits(r.outcomes >> (2 * i))))
                .collect();
            json!({
                "nonce": r.nonce,
                "outcomes": outcomes,
                "resolvedTicks": r.resolved_ticks,
            })
        })
        .collect();
    json!({
        "id": a.id,
        "bump": a.bump,
        "status": status,
        "phaseTicks": a.phase_ticks,
        "nonce": a.nonce,
        "runner": a.runner.to_string(),
        "seedReady": a.seed_ready,
        "seed": a.seed.to_string(),
        "sim": {
            "t": s.t,
            "carX": s.car_x,
            "targetLane": s.target_lane,
            "speed": s.speed,
            "nitroLeft": s.nitro_left,
            "nitroTicks": s.nitro_ticks,
            "invuln": s.invuln,
            "distance": s.distance,
            "row": s.row,
            "safeLane": s.safe_lane,
            "policeGap": s.police_gap,
            "busted": s.busted,
            "nitroPressed": s.nitro_pressed,
        },
        "bond": a.bond.to_string(),
        "noProfitOi": a.no_profit_oi.to_string(),
        "runnerFees": a.runner_fees.to_string(),
        "markets": markets,
        "results": results,
        "resultsHead": a.results_head,
    })
}

fn accounts() -> Value {
    let config = sample_config();
    let balance = sample_balance();
    let arena = sample_arena();
    json!({
        "config": { "hex": account_hex(&config), "fields": config_fields(&config) },
        "balance": { "hex": account_hex(&balance), "fields": balance_fields(&balance) },
        "arena": { "hex": account_hex(&arena), "fields": arena_fields(&arena) },
    })
}

/// Addresses the SDK hardcodes because the TS packages we pin do not export them.
fn programs() -> Value {
    json!({
        "session": session_keys::ID.to_string(),
        "vrfQueue": DEFAULT_EPHEMERAL_QUEUE.to_string(),
        "vrfTestQueue": DEFAULT_EPHEMERAL_TEST_QUEUE.to_string(),
        "token": anchor_spl::token::ID.to_string(),
        "associatedToken": anchor_spl::associated_token::ID.to_string(),
        "delegation": DELEGATION_PROGRAM_ID.to_string(),
        "magic": MAGIC_PROGRAM_ID.to_string(),
        "magicContext": MAGIC_CONTEXT_ID.to_string(),
        "vrf": VRF_PROGRAM_ID.to_string(),
    })
}

fn build_vectors() -> Value {
    json!({ "programs": programs(), "pdas": pdas(), "accounts": accounts() })
}

#[test]
fn committed_vectors_match_the_program() {
    let file = std::fs::read_to_string(vectors_path()).expect("read sdk.json");
    let committed: Value = serde_json::from_str(&file).expect("parse sdk.json");
    assert_eq!(
        committed,
        build_vectors(),
        "run `cargo test -p sirenrun --test sdk_vectors -- --ignored gen_vectors`"
    );
}

#[test]
fn sample_accounts_have_the_spec_sizes() {
    let len = |hex: &str| hex.len() / 2;
    assert_eq!(len(&account_hex(&sample_config())), Config::SPACE);
    assert_eq!(len(&account_hex(&sample_balance())), Balance::SPACE);
    assert_eq!(len(&account_hex(&sample_arena())), Arena::SPACE);
}

#[test]
#[ignore = "writes packages/test-vectors/sdk.json"]
fn gen_vectors() {
    let json = serde_json::to_string_pretty(&build_vectors()).expect("serialize");
    std::fs::write(vectors_path(), json + "\n").expect("write sdk.json");
}
