// Everything the activity page shows beyond Strava's raw fields: readable
// figures, and the segment / lap / split arrays as markdown tables.

fn two(n) { if n < 10 { `0${n}` } else { `${n}` } }

fn clock(secs) {
    if secs == () { return ""; }
    let secs = secs.to_int();
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    if h > 0 { `${h}:${two(m)}:${two(secs % 60)}` } else { `${m}:${two(secs % 60)}` }
}

fn num(v, digits) {
    if v == () { return ""; }
    let f = if digits == 0 { 1.0 } else if digits == 1 { 10.0 } else { 100.0 };
    let r = (v.to_float() * f).round() / f;
    if digits == 0 { `${r.to_int()}` } else { `${r}` }
}

fn kmh(mps) { if mps == () || mps <= 0.0 { "" } else { `${num(mps * 3.6, 1)} km/h` } }

fn km(m) { if m == () { "" } else { `${num(m / 1000.0, 2)} km` } }

fn unit(v, u) { if v == () || v == "" { "" } else { `${v} ${u}` } }

// "2026-09-12T15:48:49Z" → "15:48 on Saturday, 12 September 2026"
fn when(local) {
    if local == () { return ""; }
    let days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    let months = ["January", "February", "March", "April", "May", "June", "July",
                  "August", "September", "October", "November", "December"];
    let y = local.sub_string(0, 4).parse_int();
    let mo = local.sub_string(5, 2).parse_int();
    let d = local.sub_string(8, 2).parse_int();
    // Day of week (Sakamoto), Monday = 0.
    let t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let yy = if mo < 3 { y - 1 } else { y };
    let dow = (yy + yy / 4 - yy / 100 + yy / 400 + t[mo - 1] + d) % 7;
    let weekday = days[(dow + 6) % 7];
    `${local.sub_string(11, 5)} on ${weekday}, ${d} ${months[mo - 1]} ${y}`
}

// Strava's encoded polyline (Google's format, 1e-5 degrees) as a GeoJSON
// LineString the map plugin draws. "" when there is no track.
fn track_geojson(encoded) {
    if encoded == () || encoded == "" { return ""; }
    let chars = encoded.to_chars();
    let n = chars.len();
    let i = 0;
    let lat = 0;
    let lng = 0;
    let points = "";
    while i < n {
        let deltas = [];
        for axis in 0..2 {
            let shift = 0;
            let result = 0;
            loop {
                let b = chars[i].to_int() - 63;
                i += 1;
                result = result | ((b & 31) << shift);
                shift += 5;
                if b < 32 || i >= n { break; }
            }
            deltas.push(if (result & 1) != 0 { -(result >> 1) - 1 } else { result >> 1 });
        }
        lat += deltas[0];
        lng += deltas[1];
        let point = `[${lng.to_float() / 100000.0},${lat.to_float() / 100000.0}]`;
        points = if points == "" { point } else { `${points},${point}` };
    }
    `{"type":"LineString","coordinates":[${points}]}`
}

fn medal(rank) {
    if rank == 1 { "PR" } else if rank == 2 { "2nd best" } else if rank == 3 { "3rd best" } else { "" }
}

fn top_results(efforts) {
    if efforts == () { return ""; }
    let lines = [];
    for e in efforts {
        if e.pr_rank != () && e.pr_rank <= 3 {
            lines.push(`- **${medal(e.pr_rank)}** on ${e.name} (${clock(e.elapsed_time)})`);
        }
    }
    if lines.is_empty() {
        "No PRs on this one."
    } else {
        // Backtick strings take no escapes: newlines join as "\n".
        lines.reduce(|a, l| if a == "" { l } else { a + "\n" + l }, "")
    }
}

fn segments(efforts) {
    if efforts == () || efforts.is_empty() { return "No segments."; }
    let out = "| | Name | Time | Speed | Power | HR |\n|---|---|---|---|---|---|";
    for e in efforts {
        if e.hidden == true { continue; }
        let grade = if e.segment != () && e.segment.average_grade != () { ` · ${num(e.segment.average_grade, 1)}%` } else { "" };
        let speed = if e.moving_time != () && e.moving_time > 0 { kmh(e.distance / e.moving_time) } else { "" };
        out += "\n" + `| ${medal(e.pr_rank)} | ${e.name} · ${km(e.distance)}${grade} | ${clock(e.elapsed_time)} | ${speed} | ${unit(num(e.average_watts, 0), "W")} | ${unit(num(e.average_heartrate, 0), "bpm")} |`;
    }
    out
}

fn laps(list) {
    if list == () || list.len() < 2 { return ""; }
    let out = "| Lap | Distance | Time | Speed | Climb | Power | HR |\n|---|---|---|---|---|---|---|";
    for l in list {
        out += "\n" + `| ${l.lap_index + 1} | ${km(l.distance)} | ${clock(l.moving_time)} | ${kmh(l.average_speed)} | ${unit(num(l.total_elevation_gain, 0), "m")} | ${unit(num(l.average_watts, 0), "W")} | ${unit(num(l.average_heartrate, 0), "bpm")} |`;
    }
    out
}

fn splits(list) {
    if list == () || list.is_empty() { return ""; }
    let out = "| km | Time | Speed | Elevation | HR |\n|---|---|---|---|---|";
    for s in list {
        out += "\n" + `| ${s.split} | ${clock(s.moving_time)} | ${kmh(s.average_speed)} | ${unit(num(s.elevation_difference, 0), "m")} | ${unit(num(s.average_heartrate, 0), "bpm")} |`;
    }
    out
}

loop {
    let row = next_row();
    if row == () { break; }

    let photo = if row.photos != () && row.photos.primary != () && row.photos.primary.urls != () {
        row.photos.primary.urls["600"]
    } else { "" };
    let gear = if row.gear != () {
        `${row.gear.name} · ${num(row.gear.distance / 1000.0, 0)} km on it`
    } else { "" };

    emit(#{
        when: when(row.start_date_local),
        distance_km: num(row.distance / 1000.0, 2),
        moving: clock(row.moving_time),
        elapsed: clock(row.elapsed_time),
        elevation: num(row.total_elevation_gain, 0),
        speed_avg: kmh(row.average_speed),
        speed_max: kmh(row.max_speed),
        work_kj: num(row.kilojoules, 0),
        effort: num(row.suffer_score, 0),
        calories_kcal: num(row.calories, 0),
        hr_avg: unit(num(row.average_heartrate, 0), "bpm"),
        hr_max: unit(num(row.max_heartrate, 0), "bpm"),
        cadence_avg: unit(num(row.average_cadence, 0), "rpm"),
        watts_avg: unit(num(row.average_watts, 0), "W"),
        watts_max: unit(num(row.max_watts, 0), "W"),
        watts_weighted: num(row.weighted_average_watts, 0),
        temp: unit(num(row.average_temp, 0), "°C"),
        photo_url: if photo == () { "" } else { photo },
        track_geojson: track_geojson(if row.map == () { () } else { row.map.polyline }),
        gear_text: gear,
        top_results: top_results(row.segment_efforts),
        segments_md: segments(row.segment_efforts),
        laps_md: laps(row.laps),
        splits_md: splits(row.splits_metric),
    });
}
