use super::{generate_row, SimState};
use crate::constants::{
    ACCEL, CRASH_SPEED_PCT, GAP_MAX, INVULN_TICKS, LANE_SPEED, LANE_WIDTH, MAX_LIVE_TICKS,
    NITRO_BOOST, NITRO_TICKS, POLICE_ACCEL_DEN, POLICE_ACCEL_NUM, POLICE_BASE, ROW_GAP, SPEED_MAX,
};

/// Advances one live tick in the order defined by `docs/game-design.md`.
pub fn step(state: &mut SimState, seed: u64) {
    if state.busted {
        return;
    }

    if state.nitro_will_fire() {
        state.nitro_left -= 1;
        state.nitro_ticks = NITRO_TICKS;
    }
    state.nitro_pressed = false;

    let target_x = u16::from(state.target_lane) * LANE_WIDTH;
    state.car_x = if state.car_x < target_x {
        (state.car_x + LANE_SPEED).min(target_x)
    } else {
        state.car_x.saturating_sub(LANE_SPEED).max(target_x)
    };

    state.speed = (state.speed + ACCEL).min(SPEED_MAX);
    let mut eff = state.speed;
    if state.nitro_ticks > 0 {
        eff += NITRO_BOOST;
        state.nitro_ticks -= 1;
    }

    state.distance += u32::from(eff);

    let mut hit = false;
    while state.distance >= (state.row + 1) * ROW_GAP {
        let row = generate_row(seed, state.row, state.safe_lane);
        state.safe_lane = row.safe_lane;
        if state.invuln == 0 && row.blocked[usize::from(state.lane())] {
            hit = true;
        }
        state.row += 1;
    }

    if hit {
        state.speed = state.speed * CRASH_SPEED_PCT / 100;
        state.invuln = INVULN_TICKS;
        state.nitro_ticks = 0;
    } else if state.invuln > 0 {
        state.invuln -= 1;
    }

    let police_speed = POLICE_BASE + state.t * POLICE_ACCEL_NUM / POLICE_ACCEL_DEN;
    state.police_gap = (state.police_gap + i32::from(eff) - police_speed as i32).min(GAP_MAX);

    state.t += 1;

    if state.police_gap <= 0 || state.t >= MAX_LIVE_TICKS {
        state.busted = true;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::SPEED_START;

    #[test]
    fn busted_state_does_not_advance() {
        let mut state = SimState::start();
        state.busted = true;
        let before = state;
        step(&mut state, 1);
        assert_eq!(state, before);
    }

    #[test]
    fn lane_change_takes_three_ticks() {
        let mut state = SimState::start();
        state.set_input(3, false);
        let xs: Vec<u16> = (0..4)
            .map(|_| {
                step(&mut state, 1);
                state.car_x
            })
            .collect();
        assert_eq!(xs, [560, 640, 720, 720]);
    }

    #[test]
    fn nitro_boosts_for_its_duration_then_stops() {
        let mut state = SimState::start();
        state.set_input(2, true);
        step(&mut state, 1);
        assert_eq!(state.nitro_left, 2);
        assert_eq!(state.nitro_ticks, NITRO_TICKS - 1);
        assert_eq!(state.distance, u32::from(SPEED_START + ACCEL + NITRO_BOOST));
        for _ in 1..NITRO_TICKS {
            step(&mut state, 1);
        }
        assert_eq!(state.nitro_ticks, 0);
    }

    #[test]
    fn gap_never_exceeds_cap() {
        let mut state = SimState::start();
        for _ in 0..200 {
            state.set_input(state.safe_lane, true);
            step(&mut state, 7);
            assert!(state.police_gap <= GAP_MAX);
        }
    }
}
