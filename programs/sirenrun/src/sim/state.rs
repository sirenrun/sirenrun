use crate::constants::{GAP_START, LANES, LANE_WIDTH, NITRO_CHARGES, SPEED_START, START_LANE};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SimState {
    pub t: u32,
    pub car_x: u16,
    pub target_lane: u8,
    pub speed: u16,
    pub nitro_left: u8,
    pub nitro_ticks: u8,
    pub invuln: u8,
    pub distance: u32,
    pub row: u32,
    pub safe_lane: u8,
    pub police_gap: i32,
    pub busted: bool,
    pub nitro_pressed: bool,
}

impl SimState {
    pub const fn start() -> Self {
        Self {
            t: 0,
            car_x: START_LANE as u16 * LANE_WIDTH,
            target_lane: START_LANE,
            speed: SPEED_START,
            nitro_left: NITRO_CHARGES,
            nitro_ticks: 0,
            invuln: 0,
            distance: 0,
            row: 0,
            safe_lane: START_LANE,
            police_gap: GAP_START,
            busted: false,
            nitro_pressed: false,
        }
    }

    /// A nitro press stays pending until the next tick consumes it, even if a later input
    /// in the same tick only changes lane.
    pub fn set_input(&mut self, target_lane: u8, nitro: bool) {
        self.target_lane = target_lane.min(LANES - 1);
        self.nitro_pressed |= nitro;
    }

    pub fn lane(&self) -> u8 {
        ((self.car_x + LANE_WIDTH / 2) / LANE_WIDTH) as u8
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_clamps_lane_and_keeps_pending_nitro() {
        let mut state = SimState::start();
        state.set_input(9, true);
        state.set_input(0, false);
        assert_eq!(state.target_lane, 0);
        assert!(state.nitro_pressed);
    }

    #[test]
    fn lane_rounds_to_nearest_centre() {
        let mut state = SimState::start();
        for (car_x, lane) in [(0, 0), (119, 0), (120, 1), (480, 2), (960, 4)] {
            state.car_x = car_x;
            assert_eq!(state.lane(), lane);
        }
    }
}
