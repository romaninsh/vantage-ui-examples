//! Pure flight-profile math for the post-T-0 ascent. `sample(tick, ticks)`
//! returns one tick's telemetry; the mission script writes it onto the launch
//! so the summary view animates the climb to orbit. Kept side-effect-free so
//! the curve can be unit-tested without a database.
//!
//! Two phases, plain kinematics: a **powered** phase under constant per-axis
//! acceleration (`v = a·t`, `x = ½·a·t²`), then **MECO** (main-engine cutoff) →
//! a **coast** phase with zero acceleration (velocities held, positions growing
//! linearly). Each sample carries the per-axis *rates* (`vertical_speed_ms`,
//! `ground_speed_ms`) and the net acceleration, so the summary view can project
//! between samples from the current telemetry alone: while the engine burns the
//! acceleration carries the climb, and the instant the sim reports MECO
//! (`thrust_kn = 0`, `acceleration_ms2 = 0`) the projection flattens on its own
//! instead of integrating a dead engine to the Kármán line and beyond.

/// One ascent tick's telemetry readout.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Telemetry {
    pub met_seconds: i64,
    pub altitude_km: f64,
    pub velocity_ms: f64,
    pub acceleration_ms2: f64,
    pub downrange_km: f64,
    /// Vertical (climb) and horizontal (downrange) speed components — the rates
    /// the view extrapolates altitude / downrange from between samples.
    pub vertical_speed_ms: f64,
    pub ground_speed_ms: f64,
    /// Main-engine thrust; `0` after MECO. Drives the engine on/off indicator.
    pub thrust_kn: f64,
}

/// Mission seconds each tick represents. Ticks fire once per wall second, so
/// MET advances 15× real time — orbit insertion (540 MET ≈ T+09:00) lands over
/// the demo's ~36s of wall time. The summary view's projection uses this same
/// ×15 scale to bridge between samples.
const MET_PER_TICK: i64 = 15;
/// Fraction of the burn (percent) flown before the main engine cuts off; the
/// remaining ticks coast to orbit.
const MECO_PCT: i64 = 72;

/// Tick at which the main engine cuts off, for a burn of `ticks` ticks.
fn meco_tick(ticks: i64) -> i64 {
    ((ticks * MECO_PCT) / 100).max(1)
}

/// Orbital targets, hit at the final tick after the powered climb plus the coast.
const TARGET_ALTITUDE_KM: f64 = 200.0;
const TARGET_DOWNRANGE_KM: f64 = 2100.0;
/// Representative main-engine thrust while burning (kN); `0` once coasting.
const THRUST_KN: f64 = 7600.0;

/// Telemetry at `tick` of `ticks` (1..=ticks). Powered flight up to [`meco_tick`]
/// (acceleration constant, speeds ramping, positions quadratic), then a coast
/// (acceleration zero, speeds held, positions linear) the view can project
/// without overshooting once thrust reports zero.
pub fn sample(tick: i64, ticks: i64) -> Telemetry {
    let total = (ticks * MET_PER_TICK) as f64; // full burn duration (MET)
    let t_meco = (meco_tick(ticks) * MET_PER_TICK) as f64;
    let f = t_meco / total; // fraction of the flight flown under power

    // Per-axis acceleration calibrated so the powered climb *plus* the coast land
    // on the orbital targets at the final tick: end_pos = a · total² · f · (1 − f/2).
    let k = total * total * f * (1.0 - f / 2.0);
    let a_vert = TARGET_ALTITUDE_KM * 1000.0 / k;
    let a_down = TARGET_DOWNRANGE_KM * 1000.0 / k;

    let met = (tick * MET_PER_TICK) as f64;
    let powered = met <= t_meco;
    let t_pow = met.min(t_meco); // powered time elapsed (frozen at MECO)
    let coast = (met - t_meco).max(0.0); // coast time since cutoff

    // Speeds ramp under thrust, then hold through the coast.
    let vertical_speed_ms = a_vert * t_pow;
    let ground_speed_ms = a_down * t_pow;

    Telemetry {
        met_seconds: tick * MET_PER_TICK,
        // ½·a·t² while burning, then linear at the held cutoff speed.
        altitude_km: (0.5 * a_vert * t_pow * t_pow + vertical_speed_ms * coast) / 1000.0,
        downrange_km: (0.5 * a_down * t_pow * t_pow + ground_speed_ms * coast) / 1000.0,
        velocity_ms: (vertical_speed_ms * vertical_speed_ms + ground_speed_ms * ground_speed_ms)
            .sqrt(),
        acceleration_ms2: if powered {
            (a_vert * a_vert + a_down * a_down).sqrt()
        } else {
            0.0
        },
        vertical_speed_ms,
        ground_speed_ms,
        thrust_kn: if powered { THRUST_KN } else { 0.0 },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn climbs_through_meco_to_orbit() {
        let ticks = 36;
        let mut prev = sample(1, ticks);
        for t in 2..=ticks {
            let cur = sample(t, ticks);
            // Altitude and downrange rise the whole way (powered and coasting).
            assert!(cur.altitude_km > prev.altitude_km, "altitude must rise");
            assert!(cur.downrange_km > prev.downrange_km, "downrange must rise");
            // Speed rises under power, then holds through the coast.
            assert!(
                cur.velocity_ms >= prev.velocity_ms - 1e-6,
                "speed never drops"
            );
            prev = cur;
        }
        // The powered climb + coast land exactly on the orbital targets.
        let orbit = sample(ticks, ticks);
        assert!((orbit.altitude_km - TARGET_ALTITUDE_KM).abs() < 1.0);
        assert!((orbit.downrange_km - TARGET_DOWNRANGE_KM).abs() < 1.0);
    }

    #[test]
    fn meco_cuts_thrust_and_acceleration() {
        let ticks = 36;
        let meco = meco_tick(ticks);
        let powered = sample(meco, ticks);
        let coasting = sample(meco + 1, ticks);
        assert!(powered.thrust_kn > 0.0 && powered.acceleration_ms2 > 0.0);
        assert_eq!(coasting.thrust_kn, 0.0, "thrust is off after MECO");
        assert_eq!(coasting.acceleration_ms2, 0.0, "no acceleration coasting");
        // Speeds are held across cutoff (coast = constant velocity).
        assert_eq!(coasting.velocity_ms, powered.velocity_ms);
        assert_eq!(coasting.vertical_speed_ms, powered.vertical_speed_ms);
    }

    #[test]
    fn powered_kinematics_are_self_consistent() {
        // While burning: speed linear in MET, position quadratic — so the view's
        // rate-based projection (value + rate·Δ) tracks the curve.
        let ticks = 36;
        let a = sample(4, ticks);
        let b = sample(8, ticks); // twice the MET, still powered
        assert!((b.velocity_ms / a.velocity_ms - 2.0).abs() < 1e-9, "v ∝ t");
        assert!((b.altitude_km / a.altitude_km - 4.0).abs() < 1e-9, "h ∝ t²");
        assert!((b.vertical_speed_ms / a.vertical_speed_ms - 2.0).abs() < 1e-9);
    }
}
