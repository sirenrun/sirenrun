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
pub const NITRO_BOOST: u16 = 60;
pub const NITRO_TICKS: u8 = 20;

pub const CRASH_SPEED_PCT: u16 = 50;
pub const INVULN_TICKS: u8 = 10;

pub const ROW_GAP: u32 = 1000;
pub const EMPTY_ROWS: u32 = 3;
pub const BLOCK_BASE: u32 = 40;
pub const BLOCK_CAP: u32 = 190;

pub const GAP_START: i32 = 3000;
pub const GAP_MAX: i32 = 4000;
pub const POLICE_BASE: u32 = 95;
pub const POLICE_ACCEL_NUM: u32 = 12;
pub const POLICE_ACCEL_DEN: u32 = 100;

pub const LINES: [u32; 3] = [300, 600, 900];

pub const MAX_ENTRIES: usize = 8;
pub const ARENAS: u8 = 3;
