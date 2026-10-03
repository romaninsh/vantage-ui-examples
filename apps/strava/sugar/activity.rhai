// Display figures for a Strava activity row. Setup runs once per thread;
// the loop answers each row.

fn two(n) { if n < 10 { `0${n}` } else { `${n}` } }

fn clock(secs) {
    if secs == () { return ""; }
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    if h > 0 { `${h}:${two(m)}:${two(secs % 60)}` } else { `${m}:${two(secs % 60)}` }
}

fn kmh(mps) {
    if mps == () || mps <= 0.0 { "" } else { `${(mps * 36.0).round() / 10.0} km/h` }
}

// The app that recorded the file, from Strava's upload file name
// ("2026-09-12-154849-Outdoor Cycling-WorkOutDoors.fit").
fn source(external_id) {
    if external_id == () { return "Manual entry"; }
    let stem = external_id.split("-").pop().split(".")[0];
    if stem.to_lower().starts_with("cadence") { return "Cadence"; }
    if stem.to_lower() == "strava" { return "Strava app"; }
    let digits = true;
    for c in stem.chars() { if c < '0' || c > '9' { digits = false; } }
    if digits { "Device" } else { stem }
}

let per_sport = #{
    Swim: 100.0, Run: 1000.0, TrailRun: 1000.0, VirtualRun: 1000.0, Walk: 1000.0, Hike: 1000.0
};

loop {
    let row = next_row();
    if row == () { break; }

    let mps = row.average_speed;
    let per = per_sport[row.sport_type];
    let pace = if mps == () || mps <= 0.0 {
        ""
    } else if per == () {
        kmh(mps)
    } else {
        let s = (per / mps).round().to_int();
        let unit = if per == 100.0 { "/100m" } else { "/km" };
        `${s / 60}:${two(s % 60)} ${unit}`
    };

    let km = row.distance / 1000.0;
    let climb = row.total_elevation_gain;
    let tags = [];
    if row.trainer == true { tags.push("Indoor"); }
    if row.commute == true { tags.push("Commute"); }
    if row.manual == true { tags.push("Manual"); }
    // `private` is a Rhai keyword, so it's read by index.
    if row["private"] == true { tags.push("Private"); }
    if row.athlete_count > 1 { tags.push(`Group of ${row.athlete_count}`); }

    emit(#{
        distance_km: (km * 100.0).round() / 100.0,
        moving: clock(row.moving_time),
        elapsed: clock(row.elapsed_time),
        stopped: clock(row.elapsed_time - row.moving_time),
        pace: pace,
        top_speed: kmh(row.max_speed),
        climb_per_km: if km > 0.5 && climb != () { (climb / km * 10.0).round() / 10.0 } else { () },
        tags: tags.reduce(|a, t| if a == "" { t } else { `${a} · ${t}` }, ""),
        source: source(row.external_id),
    });
}
