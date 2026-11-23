pub const TICK_MS: u32 = 100;
pub const STAGING_TICKS: u32 = 100;
pub const SETTLE_TICKS: u32 = 30;
pub const MAX_LIVE_TICKS: u32 = 1500;

pub const LANES: u8 = 5;
pub const START_LANE: u8 = 2;
pub const LANE_WIDTH: u16 = 240;
pub const LANE_SPEED: u16 = 80;

pub const SPEED_START: u16 = 100;
pub const SPEED_MAX: u16 = 200;
pub const ACCEL: u16 = 2;

pub const NITRO_CHARGES: u8 = 3;
pub const NITRO_BOOST: u16 = 40;
pub const NITRO_TICKS: u8 = 20;

pub const CRASH_SPEED_PCT: u16 = 40;
pub const INVULN_TICKS: u8 = 10;

pub const ROW_GAP: u32 = 1000;
pub const EMPTY_ROWS: u32 = 3;
pub const BLOCK_BASE: u32 = 40;
pub const BLOCK_CAP: u32 = 190;

pub const GAP_START: i32 = 1500;
pub const GAP_MAX: i32 = 1500;
pub const POLICE_BASE: u32 = 160;
pub const POLICE_ACCEL_NUM: u32 = 6;
pub const POLICE_ACCEL_DEN: u32 = 100;

pub const LINES: [u32; 3] = [300, 600, 900];
/// Survival bonus the house pays the driver at settle for each line passed, in tUSDC base
/// units (1 / 3 / 6 tUSDC). Paid only up to what the house holds, so a tick never fails.
pub const LINE_BONUS: [u64; 3] = [1_000_000, 3_000_000, 6_000_000];

pub const MAX_ENTRIES: usize = 8;
pub const ARENAS: u8 = 3;
pub const SEED_TIMEOUT_TICKS: u32 = 50;
pub const COOLDOWN_TICKS: u32 = 15;
