// Dispatcher — hands shipments booked in the desk form to a shipment sim.
//
// Rows written by sims/shipment.rhai carry that sim's id in `sim`. A row
// saved from the desk form has none. Every 8 sim minutes (2 real seconds at
// `clock: 240`) this loop claims each such row and starts a `shipment` sim
// on it with `args.id`; that sim adopts the row and moves it along. When the
// shipment sims are at their `max`, the claim is released and the row is
// tried again on the next pass.

fn unowned(row) {
    if type_of(row) != "map" { return false; }
    let owner = if "sim" in row { row.sim } else { () };
    type_of(owner) == "()" || owner == ""
}

loop {
    for id in table().ids() {
        if unowned(table().get(id)) {
            table().patch(id, #{ sim: sim_id() });
            if !spawn_sim("shipment", #{ id: id }) {
                table().patch(id, #{ sim: "" });
            }
        }
    }
    sleep(minutes(8));
}
