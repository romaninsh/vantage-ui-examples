step.log("Waiting for confirmation…");
step.wait("confirmed");
let source = wizard.steps.pick.source;
state.total = source.row_count;
state.status = "Saving the bakery…";
let bakery_id = wizard.servos.bakery.save();
step.log(`Bakery ${bakery_id} saved.`);
state.status = "Importing products…";
// Values arrive as the CSV read them — `price` is already an int.
// `bakery` is an id string, which the destination's declared
// `references:` turns into a record link, exactly as on a
// single-record insert.
// The import reports what it did: `inserted`, `skipped` (ids the
// table already held — never overwritten), and `cancelled` when
// the user stopped it partway.
let result = tables.product.import_values(
  table(source.vista),
  #{ id: "product:${row.sku}",
     name: "${row.name}",
     price: "${row.price}",
     calories: "${row.calories}",
     bakery: bakery_id,
     inventory: #{ stock: 0 } });
state.imported = result.inserted;
state.status = if result.cancelled { "Stopped." } else { "Done." };
state.finished = true;
step.log(`Imported ${result.inserted} products; ${result.skipped} already existed.`);
