use crate::constants::{BLOCK_BASE, BLOCK_CAP, EMPTY_ROWS, LANES};

const GOLDEN_GAMMA: u64 = 0x9E37_79B9_7F4A_7C15;

pub fn splitmix64(x: u64) -> u64 {
    let x = x.wrapping_add(GOLDEN_GAMMA);
    let z = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    let z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

pub fn row_hash(seed: u64, row: u32) -> u64 {
    splitmix64(seed ^ u64::from(row).wrapping_mul(GOLDEN_GAMMA))
}

pub fn next_safe_lane(prev: u8, hash: u64) -> u8 {
    match hash & 0b11 {
        0 => prev.saturating_sub(1),
        3 => (prev + 1).min(LANES - 1),
        _ => prev,
    }
}

pub fn blocked(row: u32, lane: u8, safe_lane: u8, hash: u64) -> bool {
    if row < EMPTY_ROWS || lane == safe_lane {
        return false;
    }
    let threshold = BLOCK_CAP.min(BLOCK_BASE + row / 2);
    let byte = (hash >> (8 * (u32::from(lane) + 1))) & 0xFF;
    byte < u64::from(threshold)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Row {
    pub safe_lane: u8,
    pub blocked: [bool; LANES as usize],
}

pub fn generate_row(seed: u64, row: u32, prev_safe_lane: u8) -> Row {
    let hash = row_hash(seed, row);
    let safe_lane = next_safe_lane(prev_safe_lane, hash);
    let lanes = core::array::from_fn(|lane| blocked(row, lane as u8, safe_lane, hash));
    Row {
        safe_lane,
        blocked: lanes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splitmix64_matches_reference_output() {
        assert_eq!(splitmix64(0), 0xE220_A839_7B1D_CDAF);
    }

    #[test]
    fn safe_lane_moves_at_most_one_and_stays_on_road() {
        assert_eq!(next_safe_lane(2, 0), 1);
        assert_eq!(next_safe_lane(2, 1), 2);
        assert_eq!(next_safe_lane(2, 2), 2);
        assert_eq!(next_safe_lane(2, 3), 3);
        assert_eq!(next_safe_lane(0, 0), 0);
        assert_eq!(next_safe_lane(LANES - 1, 3), LANES - 1);
    }

    #[test]
    fn opening_rows_and_safe_lane_are_never_blocked() {
        for row in 0..EMPTY_ROWS {
            for lane in 0..LANES {
                assert!(!blocked(row, lane, 0, 0));
            }
        }
        assert!(!blocked(500, 3, 3, 0));
    }

    #[test]
    fn threshold_grows_with_row_and_caps() {
        let hash_with_byte = |lane: u8, byte: u64| byte << (8 * (u32::from(lane) + 1));
        assert!(blocked(3, 1, 0, hash_with_byte(1, 40)));
        assert!(!blocked(3, 1, 0, hash_with_byte(1, 41)));
        assert!(blocked(100, 1, 0, hash_with_byte(1, 89)));
        assert!(!blocked(100, 1, 0, hash_with_byte(1, 90)));
        assert!(blocked(10_000, 1, 0, hash_with_byte(1, 189)));
        assert!(!blocked(10_000, 1, 0, hash_with_byte(1, 190)));
    }

    #[test]
    fn every_row_keeps_its_safe_lane_clear() {
        let mut safe = 2;
        for row in 0..2_000 {
            let r = generate_row(42, row, safe);
            assert!(!r.blocked[usize::from(r.safe_lane)]);
            assert!(r.safe_lane.abs_diff(safe) <= 1);
            safe = r.safe_lane;
        }
    }
}
