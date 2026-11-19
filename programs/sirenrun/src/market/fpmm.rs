const BPS: u128 = 10_000;

/// Pool reserves after a buy, and the shares the buyer receives.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fill {
    pub yes: u64,
    pub no: u64,
    pub shares: u64,
}

/// Fixed product buy: `amount` mints that many complete sets, the unwanted side goes into
/// the pool, and the pool pays out of the wanted side until `yes * no` is restored.
/// Rounds the pool's reserve up, so the buyer never gets a fractional share too many.
/// Returns `None` on overflow or an empty pool.
pub fn buy(yes: u64, no: u64, buy_yes: bool, amount: u64) -> Option<Fill> {
    let (same, other) = if buy_yes { (yes, no) } else { (no, yes) };
    let k = u128::from(same).checked_mul(u128::from(other))?;
    let other_after = u128::from(other).checked_add(u128::from(amount))?;
    if other_after == 0 {
        return None;
    }
    let same_before_payout = u128::from(same).checked_add(u128::from(amount))?;
    let same_after = k.div_ceil(other_after);
    let shares = u64::try_from(same_before_payout.checked_sub(same_after)?).ok()?;
    let same_after = u64::try_from(same_after).ok()?;
    let other_after = u64::try_from(other_after).ok()?;
    Some(if buy_yes {
        Fill {
            yes: same_after,
            no: other_after,
            shares,
        }
    } else {
        Fill {
            yes: other_after,
            no: same_after,
            shares,
        }
    })
}

/// `amount * bps / 10_000`, rounded down.
pub fn mul_bps(amount: u64, bps: u16) -> Option<u64> {
    u64::try_from(u128::from(amount) * u128::from(bps) / BPS).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::splitmix64;

    fn random_cases(count: usize) -> impl Iterator<Item = (u64, u64, bool, u64)> {
        let mut rng = 7u64;
        let mut next = move |bits: u32| {
            rng = splitmix64(rng);
            (rng >> (64 - bits)).max(1)
        };
        (0..count).map(move |_| (next(40), next(40), next(1) == 1, next(36)))
    }

    #[test]
    fn spec_example_pays_more_than_one_share_per_unit() {
        let fill = buy(50_000_000, 50_000_000, true, 10_000_000).unwrap();
        assert_eq!(fill.no, 60_000_000);
        assert_eq!(fill.yes, 41_666_667);
        assert_eq!(fill.shares, 50_000_000 + 10_000_000 - 41_666_667);
    }

    #[test]
    fn buyer_gets_at_least_one_share_per_unit() {
        for (yes, no, buy_yes, amount) in random_cases(10_000) {
            let fill = buy(yes, no, buy_yes, amount).unwrap();
            assert!(fill.shares >= amount, "{yes} {no} {buy_yes} {amount}");
        }
    }

    #[test]
    fn invariant_never_decreases() {
        for (yes, no, buy_yes, amount) in random_cases(10_000) {
            let fill = buy(yes, no, buy_yes, amount).unwrap();
            let before = u128::from(yes) * u128::from(no);
            let after = u128::from(fill.yes) * u128::from(fill.no);
            assert!(after >= before);
        }
    }

    #[test]
    fn price_moves_toward_the_side_bought() {
        for (yes, no, buy_yes, amount) in random_cases(10_000) {
            let fill = buy(yes, no, buy_yes, amount).unwrap();
            let price_yes = |y: u64, n: u64| (u128::from(n), u128::from(y) + u128::from(n));
            let (num0, den0) = price_yes(yes, no);
            let (num1, den1) = price_yes(fill.yes, fill.no);
            if buy_yes {
                assert!(num1 * den0 >= num0 * den1);
            } else {
                assert!(num1 * den0 <= num0 * den1);
            }
        }
    }

    #[test]
    fn overflow_and_empty_pools_return_none() {
        assert_eq!(buy(u64::MAX, u64::MAX, true, u64::MAX), None);
        assert_eq!(buy(0, 0, true, 0), None);
    }

    #[test]
    fn bps_rounds_down_and_never_overflows() {
        assert_eq!(mul_bps(1_000_000, 200), Some(20_000));
        assert_eq!(mul_bps(49, 200), Some(0));
        assert_eq!(mul_bps(u64::MAX, 10_000), Some(u64::MAX));
    }
}
