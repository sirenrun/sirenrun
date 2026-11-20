//! FPMM vectors for the TypeScript price helpers in `packages/sdk`.
//!
//! Quotes run through `Arena::buy`, the same pure function the `buy` instruction calls, so
//! the client's fee rounding, NO profit cap and error choice cannot drift from the program.

use anchor_lang::prelude::{Error, Pubkey};
use serde::{Deserialize, Serialize};
use sirenrun::constants::{LINES, MAX_ENTRIES};
use sirenrun::market::{buy, mul_bps};
use sirenrun::sim::{splitmix64, SimState};
use sirenrun::state::{
    Arena, ArenaStatus, Balance, BuyTerms, Market, MarketStatus, PositionEntry, RunResult, Side,
    MARKETS, RESULTS,
};
use std::path::PathBuf;

const TUSDC: u64 = 1_000_000;
const RANDOM_CASES: usize = 200;

#[derive(Serialize, Deserialize, PartialEq, Debug)]
struct VectorFile {
    buys: Vec<BuyCase>,
    bps: Vec<BpsCase>,
    quotes: Vec<QuoteCase>,
}

/// `fpmm::buy`; `fill` is `None` when the program returns an error.
#[derive(Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
struct BuyCase {
    yes: String,
    no: String,
    buy_yes: bool,
    amount: String,
    fill: Option<FillOut>,
}

#[derive(Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
struct FillOut {
    yes: String,
    no: String,
    shares: String,
}

#[derive(Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
struct BpsCase {
    amount: String,
    bps: u16,
    out: String,
}

#[derive(Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
struct QuoteCase {
    fee_bps: u16,
    runner_fee_bps: u16,
    max_buy: String,
    yes_r: String,
    no_r: String,
    bond: String,
    no_profit_oi: String,
    side: String,
    amount: String,
    result: QuoteResult,
}

#[derive(Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum QuoteResult {
    #[serde(rename = "ok")]
    #[serde(rename_all = "camelCase")]
    Ok {
        fee: String,
        runner_fee: String,
        net: String,
        shares: String,
        yes_r: String,
        no_r: String,
        no_profit_oi: String,
    },
    #[serde(rename = "error")]
    Error { name: String },
}

struct QuoteInput {
    terms: BuyTerms,
    yes_r: u64,
    no_r: u64,
    bond: u64,
    no_profit_oi: u64,
    side: Side,
    amount: u64,
}

fn vectors_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packages/test-vectors/fpmm.json")
}

struct Rng(u64);

impl Rng {
    fn below(&mut self, n: u64) -> u64 {
        self.0 = splitmix64(self.0);
        self.0 % n
    }
}

fn balance(owner: Pubkey, available: u64) -> Balance {
    Balance {
        owner,
        available,
        entries: [PositionEntry::default(); MAX_ENTRIES],
        bump: 255,
    }
}

fn live_arena(input: &QuoteInput) -> Arena {
    let mut markets = [Market::default(); MARKETS];
    for (market, line) in markets.iter_mut().zip(LINES) {
        market.line = line as u16;
        market.status = MarketStatus::Open;
        market.yes_r = input.yes_r;
        market.no_r = input.no_r;
    }
    Arena {
        id: 0,
        bump: 255,
        status: ArenaStatus::Live,
        phase_ticks: 0,
        nonce: 1,
        runner: Pubkey::new_from_array([9; 32]),
        seed_ready: true,
        seed: 42,
        sim: SimState::start().into(),
        bond: input.bond,
        no_profit_oi: input.no_profit_oi,
        runner_fees: 0,
        markets,
        results: [RunResult::default(); RESULTS],
        results_head: 0,
    }
}

fn error_name(err: Error) -> String {
    match err {
        Error::AnchorError(e) => e.error_name,
        Error::ProgramError(e) => format!("{:?}", e.program_error),
    }
}

fn quote(input: QuoteInput) -> QuoteCase {
    let mut arena = live_arena(&input);
    let mut trader = balance(Pubkey::new_from_array([1; 32]), u64::MAX);
    let mut house = balance(Pubkey::new_from_array([2; 32]), 0);
    let result = match arena.buy(
        &mut trader,
        &mut house,
        input.terms,
        0,
        input.side,
        input.amount,
        0,
    ) {
        Ok(trade) => QuoteResult::Ok {
            fee: (input.amount - trade.net).to_string(),
            runner_fee: arena.runner_fees.to_string(),
            net: trade.net.to_string(),
            shares: trade.fill.shares.to_string(),
            yes_r: trade.fill.yes.to_string(),
            no_r: trade.fill.no.to_string(),
            no_profit_oi: arena.no_profit_oi.to_string(),
        },
        Err(err) => QuoteResult::Error {
            name: error_name(err),
        },
    };
    QuoteCase {
        fee_bps: input.terms.fee_bps,
        runner_fee_bps: input.terms.runner_fee_bps,
        max_buy: input.terms.max_buy.to_string(),
        yes_r: input.yes_r.to_string(),
        no_r: input.no_r.to_string(),
        bond: input.bond.to_string(),
        no_profit_oi: input.no_profit_oi.to_string(),
        side: format!("{:?}", input.side).to_lowercase(),
        amount: input.amount.to_string(),
        result,
    }
}

fn buy_case(yes: u64, no: u64, buy_yes: bool, amount: u64) -> BuyCase {
    BuyCase {
        yes: yes.to_string(),
        no: no.to_string(),
        buy_yes,
        amount: amount.to_string(),
        fill: buy(yes, no, buy_yes, amount).map(|f| FillOut {
            yes: f.yes.to_string(),
            no: f.no.to_string(),
            shares: f.shares.to_string(),
        }),
    }
}

fn build_vectors() -> VectorFile {
    let mut rng = Rng(0x5eed_f00d);

    let mut buys = vec![
        buy_case(50 * TUSDC, 50 * TUSDC, true, 10 * TUSDC),
        buy_case(50 * TUSDC, 50 * TUSDC, false, 10 * TUSDC),
        buy_case(50 * TUSDC, 50 * TUSDC, true, 0),
        buy_case(1, 1, true, 1),
        buy_case(0, 0, true, 0),
        buy_case(u64::MAX, u64::MAX, true, u64::MAX),
        buy_case(u64::MAX / 2, 3, false, u64::MAX / 2),
    ];
    for _ in 0..RANDOM_CASES {
        let yes = 1 + rng.below(1 << 40);
        let no = 1 + rng.below(1 << 40);
        let amount = rng.below(1 << 36);
        buys.push(buy_case(yes, no, rng.below(2) == 0, amount));
    }

    let mut bps: Vec<BpsCase> = [
        (1_000_000, 200),
        (49, 200),
        (50, 200),
        (u64::MAX, 10_000),
        (u64::MAX, 9_999),
        (0, 10_000),
    ]
    .into_iter()
    .chain((0..50).map(|_| (rng.below(u64::MAX), rng.below(10_001) as u16)))
    .map(|(amount, bps)| BpsCase {
        amount: amount.to_string(),
        bps,
        out: mul_bps(amount, bps).expect("bps").to_string(),
    })
    .collect();
    bps.sort_by(|a, b| (a.bps, &a.amount).cmp(&(b.bps, &b.amount)));

    let terms = BuyTerms {
        fee_bps: 200,
        runner_fee_bps: 100,
        max_buy: 50 * TUSDC,
    };
    let base = |side, amount| QuoteInput {
        terms,
        yes_r: 50 * TUSDC,
        no_r: 50 * TUSDC,
        bond: 25 * TUSDC,
        no_profit_oi: 0,
        side,
        amount,
    };
    let mut quotes = vec![
        quote(base(Side::Yes, 10 * TUSDC)),
        quote(base(Side::No, 10 * TUSDC)),
        quote(base(Side::Yes, 49)),
        quote(base(Side::Yes, 0)),
        quote(base(Side::Yes, 50 * TUSDC)),
        quote(base(Side::Yes, 50 * TUSDC + 1)),
        quote(QuoteInput {
            no_profit_oi: 25 * TUSDC - 1,
            ..base(Side::No, 5 * TUSDC)
        }),
        quote(QuoteInput {
            no_profit_oi: 25 * TUSDC - 1,
            ..base(Side::Yes, 5 * TUSDC)
        }),
        quote(QuoteInput {
            yes_r: u64::MAX,
            no_r: u64::MAX,
            terms: BuyTerms {
                max_buy: u64::MAX,
                ..terms
            },
            ..base(Side::Yes, u64::MAX)
        }),
    ];
    for _ in 0..RANDOM_CASES {
        let fee_bps = rng.below(1_001) as u16;
        let input = QuoteInput {
            terms: BuyTerms {
                fee_bps,
                runner_fee_bps: rng.below(u64::from(fee_bps) + 1) as u16,
                max_buy: 50 * TUSDC,
            },
            yes_r: 1 + rng.below(200 * TUSDC),
            no_r: 1 + rng.below(200 * TUSDC),
            bond: 25 * TUSDC,
            no_profit_oi: rng.below(25 * TUSDC),
            side: if rng.below(2) == 0 {
                Side::Yes
            } else {
                Side::No
            },
            amount: rng.below(55 * TUSDC),
        };
        quotes.push(quote(input));
    }

    VectorFile { buys, bps, quotes }
}

#[test]
fn committed_vectors_match_the_program() {
    let file = std::fs::read_to_string(vectors_path()).expect("read fpmm.json");
    let committed: VectorFile = serde_json::from_str(&file).expect("parse fpmm.json");
    assert_eq!(
        committed,
        build_vectors(),
        "run `cargo test -p sirenrun --test fpmm -- --ignored gen_vectors`"
    );
}

#[test]
fn vectors_cover_every_quote_outcome() {
    let vectors = build_vectors();
    let errors: Vec<_> = vectors
        .quotes
        .iter()
        .filter_map(|q| match &q.result {
            QuoteResult::Error { name } => Some(name.as_str()),
            QuoteResult::Ok { .. } => None,
        })
        .collect();
    for name in ["TooLarge", "NoInterestCapReached", "MathOverflow"] {
        assert!(errors.contains(&name), "no {name} case");
    }
    assert!(vectors.buys.iter().any(|b| b.fill.is_none()));
}

#[test]
#[ignore = "writes packages/test-vectors/fpmm.json"]
fn gen_vectors() {
    let json = serde_json::to_string_pretty(&build_vectors()).expect("serialize");
    std::fs::write(vectors_path(), json + "\n").expect("write fpmm.json");
}
