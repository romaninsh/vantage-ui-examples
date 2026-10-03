// Shipment — one parcel from booking to delivery, played on the sim clock.
//
// Started two ways:
//   - by the spawner (datasource/logistics.yaml): a fresh booking, so the
//     script inserts its own `shipment` row;
//   - by the dispatcher with `args.id`: a booking saved from the desk form,
//     so the script adopts that row and fills in what the form left blank.
//
// Status runs Booked -> Picked up -> In transit (3-6 legs) -> Out for
// delivery -> Delivered. Each leg has an 8% chance of an Exception that
// holds the parcel and marks it late. Every step inserts a `tracking_event`
// row and patches the shipment's status, position, trail (a GeoJSON
// LineString of the positions so far), last scan and ETA. Two sim days after
// delivery the shipment and its events are deleted.
//
// Durations are sim time. At `clock: 240` one real minute is four sim hours,
// and a delivery (about 9-24 sim hours) takes 3-6 real minutes. Times people
// read are wall-clock (`wall_now`, `wall_in`), so relative dates stay honest.

let hubs = [
    #{ city: "Rotterdam", lat: 51.9244, lon: 4.4777 },
    #{ city: "Hamburg", lat: 53.5511, lon: 9.9937 },
    #{ city: "Antwerp", lat: 51.2194, lon: 4.4025 },
    #{ city: "Paris", lat: 48.8566, lon: 2.3522 },
    #{ city: "Lyon", lat: 45.7640, lon: 4.8357 },
    #{ city: "Madrid", lat: 40.4168, lon: -3.7038 },
    #{ city: "Milan", lat: 45.4642, lon: 9.1900 },
    #{ city: "Munich", lat: 48.1351, lon: 11.5820 },
    #{ city: "Warsaw", lat: 52.2297, lon: 21.0122 },
    #{ city: "Prague", lat: 50.0755, lon: 14.4378 },
    #{ city: "Vienna", lat: 48.2082, lon: 16.3738 },
    #{ city: "Copenhagen", lat: 55.6761, lon: 12.5683 },
];
let carriers = ["DHL", "FedEx", "UPS", "DPD", "Evri", "Maersk Line"];
let services = ["Economy", "Standard", "Express", "Overnight"];

fn blank(v) {
    type_of(v) == "()" || v == ""
}

fn r4(x) {
    (x * 10000.0).round() / 10000.0
}

// One GeoJSON position, `[lon,lat]`.
fn pos(lat, lon) {
    "[" + r4(lon) + "," + r4(lat) + "]"
}

fn line_string(pts) {
    let coords = "";
    for p in pts {
        if coords != "" { coords += ","; }
        coords += p;
    }
    "{\"type\":\"LineString\",\"coordinates\":[" + coords + "]}"
}

fn hub_named(hubs, city) {
    for h in hubs {
        if h.city == city { return h; }
    }
    ()
}

fn nearest_city(hubs, lat, lon) {
    let best = hubs[0];
    let best_km = great_circle(lat, lon, best.lat, best.lon);
    for h in hubs {
        let km = great_circle(lat, lon, h.lat, h.lon);
        if km < best_km {
            best = h;
            best_km = km;
        }
    }
    best.city
}

// One scan: a tracking_event row, and the shipment patched to match.
fn step(id, ref, status, event, lat, lon, city, trail, extra) {
    let at = wall_now();
    table("tracking_event").insert(#{
        shipment_id: id,
        shipment_ref: ref,
        city: city,
        event: event,
        lat: r4(lat),
        lon: r4(lon),
        scanned_at: at,
    });
    let p = #{
        status: status,
        lat: r4(lat),
        lon: r4(lon),
        location: city,
        last_scan: at,
        trail: trail,
    };
    p.mixin(extra);
    table().patch(id, p);
}

// Adopt a desk-form booking, or start a fresh one.
let row = #{};
if "id" in args {
    row = table().get(args.id);
    if type_of(row) != "map" { done(); }
}

let origin = hub_named(hubs, row.origin_city);
if type_of(origin) == "()" { origin = pick(hubs); }
let dest = hub_named(hubs, row.destination_city);
while type_of(dest) == "()" || dest.city == origin.city {
    dest = pick(hubs);
}

// The plan, in sim seconds: a few hours to pick up, 6 h plus 1 h per 250 km
// on the road, a few hours out for delivery.
let km = great_circle(origin.lat, origin.lon, dest.lat, dest.lon);
let pickup_wait = hours(rand_float(2.0, 5.0));
let transit = hours(6.0 + km / 250.0);
let due = now_secs() + pickup_wait + transit + hours(3);
let late = false;
let pts = [pos(origin.lat, origin.lon)];

let fields = #{
    origin_city: origin.city,
    destination_city: dest.city,
    status: "Booked",
    eta: wall_in(due - now_secs()),
    lat: origin.lat,
    lon: origin.lon,
    location: origin.city,
    late: false,
    active: true,
    trail: line_string(pts),
    sim: sim_id(),
};
if blank(row.tracking_no) { fields.tracking_no = pattern("NW-########"); }
if blank(row.customer) { fields.customer = fake("company"); }
if blank(row.carrier) { fields.carrier = pick(carriers); }
if blank(row.service_level) { fields.service_level = pick(services); }
if blank(row.pieces) { fields.pieces = rand_int(1, 20); }
if blank(row.weight_kg) { fields.weight_kg = (rand_float(0.5, 500.0) * 100.0).round() / 100.0; }
if blank(row.declared_value) { fields.declared_value = (rand_float(20.0, 8000.0) * 100.0).round() / 100.0; }
if blank(row.created_at) { fields.created_at = wall_now(); }

let id = ();
if "id" in args {
    id = args.id;
    table().patch(id, fields);
} else {
    id = table().insert(fields);
}
let ref = if blank(row.tracking_no) { fields.tracking_no } else { row.tracking_no };

step(id, ref, "Booked", "Label created", origin.lat, origin.lon, origin.city, line_string(pts), #{});

sleep(pickup_wait);
step(id, ref, "Picked up", "Collected from sender", origin.lat, origin.lon, origin.city, line_string(pts), #{});

let legs = rand_int(3, 6);
let leg_time = transit / legs.to_float();
for leg in 1..=legs {
    sleep(leg_time);
    let p = interpolate(origin.lat, origin.lon, dest.lat, dest.lon, leg.to_float() / legs.to_float());
    let city = nearest_city(hubs, p.lat, p.lon);
    pts.push(pos(p.lat, p.lon));
    if chance(0.08) {
        let hold = hours(rand_float(2.0, 6.0));
        let reason = pick(["Address query", "Customs hold", "Damaged label", "Weather delay"]);
        late = true;
        due += hold;
        step(id, ref, "Exception", reason, p.lat, p.lon, city, line_string(pts),
            #{ late: true, eta: wall_in(due - now_secs()) });
        sleep(hold);
    }
    let event = if leg == legs { "Arrived at delivery depot" } else { "Departed hub" };
    step(id, ref, "In transit", event, p.lat, p.lon, city, line_string(pts), #{});
}

step(id, ref, "Out for delivery", "With courier", dest.lat, dest.lon, dest.city, line_string(pts), #{});
sleep(hours(rand_float(1.0, 3.0)));
late = late || now_secs() > due;
step(id, ref, "Delivered", "Signed for", dest.lat, dest.lon, dest.city, line_string(pts),
    #{ late: late, eta: wall_now(), active: false });

sleep(days(2));
for e in table("tracking_event").ids() {
    let ev = table("tracking_event").get(e);
    if type_of(ev) == "map" && ev.shipment_id == id {
        table("tracking_event").delete(e);
    }
}
table().delete(id);
