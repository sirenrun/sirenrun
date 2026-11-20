//! Opening a pool at a set price, and sharing a busted driver's bond between RIDE holders.

const BPS: u128 = 10_000;

/// A market's opening position. The house mints `liquidity` complete sets: the pool gets
/// reserves priced at the opening YES price, the house keeps the tokens left over.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Opening {
    pub yes_r: u64,
    pub no_r: u64,
    pub house_yes: u64,
    pub house_no: u64,
}

/// Pool reserves for an opening YES price of `open_bps / 10_000`, where the price is
/// `no / (yes + no)`. The dearer side's reserve is the full `liquidity`; the cheaper side
/// gets `liquidity * cheap / dear`, rounded down, and the house keeps the difference, so
/// every minted token is either in the pool or the house's. `None` if `open_bps` is not
/// strictly between 0 and 10_000.
pub fn open_pool(liquidity: u64, open_bps: u16) -> Option<Opening> {
    let yes_price = u128::from(open_bps);
    if yes_price == 0 || yes_price >= BPS {
        return None;
    }
    let no_price = BPS - yes_price;
    let l = u128::from(liquidity);
    if yes_price >= no_price {
        // YES is the favourite: the pool holds fewer YES tokens.
        let yes_r = u64::try_from(l * no_price / yes_price).ok()?;
        Some(Opening {
            yes_r,
            no_r: liquidity,
            house_yes: liquidity - yes_r,
            house_no: 0,
        })
    } else {
        let no_r = u64::try_from(l * yes_price / no_price).ok()?;
        Some(Opening {
            yes_r: liquidity,
            no_r,
            house_yes: 0,
            house_no: liquidity - no_r,
        })
    }
}

/// What a bust takes from the driver's bond: the BUST profit owed on the markets it closed,
/// at most the bond. Anyone may be the driver betting BUST from another wallet, so the driver
/// must lose at least everything BUST holders can win; no more is needed, so a run nobody
/// bet against costs the driver nothing.
pub fn forfeit(bond: u64, bust_profit: u64) -> u64 {
    bond.min(bust_profit)
}

/// The share of a losing RIDE position's cost refunded out of the forfeit, in bps, for one
/// market: its part of the forfeit (by its BUST profit) over the RIDE cost there. Rounds down,
/// so the refunds never exceed the forfeit. Zero when nobody held RIDE.
pub fn ride_back_bps(forfeit: u64, market_profit: u64, total_profit: u64, ride_cost: u64) -> u16 {
    if forfeit == 0 || market_profit == 0 || total_profit == 0 || ride_cost == 0 {
        return 0;
    }
    let share = u128::from(forfeit) * u128::from(market_profit) / u128::from(total_profit);
    let bps = (share * BPS / u128::from(ride_cost)).min(BPS);
    bps as u16
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::splitmix64;

    fn price_bps(o: Opening) -> u128 {
        u128::from(o.no_r) * BPS / (u128::from(o.yes_r) + u128::from(o.no_r))
    }

    #[test]
    fn opens_at_the_requested_price_and_accounts_for_every_token() {
        for (liquidity, bps) in [
            (50_000_000, 8_500),
            (50_000_000, 4_500),
            (50_000_000, 1_500),
        ] {
            let o = open_pool(liquidity, bps).unwrap();
            assert_eq!(o.yes_r + o.house_yes, liquidity);
            assert_eq!(o.no_r + o.house_no, liquidity);
            assert!(price_bps(o).abs_diff(u128::from(bps)) <= 1, "{bps}: {o:?}");
        }
        let even = open_pool(7, 5_000).unwrap();
        assert_eq!(
            (even.yes_r, even.no_r, even.house_yes, even.house_no),
            (7, 7, 0, 0)
        );
    }

    #[test]
    fn rejects_prices_at_the_ends() {
        assert_eq!(open_pool(50, 0), None);
        assert_eq!(open_pool(50, 10_000), None);
        assert_eq!(open_pool(50, 20_000), None);
    }

    #[test]
    fn every_opening_conserves_the_minted_sets() {
        let mut rng = 3u64;
        for _ in 0..10_000 {
            rng = splitmix64(rng);
            let liquidity = rng >> 20;
            let bps = (rng % 9_999 + 1) as u16;
            let o = open_pool(liquidity, bps).unwrap();
            assert_eq!(o.yes_r + o.house_yes, liquidity);
            assert_eq!(o.no_r + o.house_no, liquidity);
        }
    }

    #[test]
    fn forfeit_is_what_bust_won_capped_at_the_bond() {
        assert_eq!(forfeit(25, 0), 0);
        assert_eq!(forfeit(25, 7), 7);
        assert_eq!(forfeit(25, 90), 25);
    }

    #[test]
    fn ride_refunds_split_the_forfeit_and_never_exceed_it() {
        // 10 forfeited, market 0 owed 6 of 8 BUST profit: its share is 7.5 -> 7, over 70 RIDE.
        assert_eq!(ride_back_bps(10, 6, 8, 70), 1_000);
        // Less RIDE cost than the share: refunded in full, the rest stays with the house.
        assert_eq!(ride_back_bps(10, 8, 8, 4), 10_000);
        assert_eq!(ride_back_bps(0, 6, 8, 70), 0);
        assert_eq!(ride_back_bps(10, 6, 8, 0), 0);
        let mut rng = 5u64;
        for _ in 0..10_000 {
            rng = splitmix64(rng);
            let total = (rng >> 40) + 1;
            let part = rng % total + 1;
            let f = (rng >> 20) % (total + 1);
            let cost = (rng >> 33) + 1;
            let bps = ride_back_bps(f, part, total, cost);
            let paid = u128::from(cost) * u128::from(bps) / BPS;
            assert!(paid * u128::from(total) <= u128::from(f) * u128::from(part));
        }
    }
}
