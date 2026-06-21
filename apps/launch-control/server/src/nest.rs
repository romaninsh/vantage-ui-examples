//! Turn a Vista row into JSON, and (for `?mode=detailed`) recursively expand its
//! belongs-to relations into nested objects — driven entirely by the Vista's own
//! reference graph (`list_references` + `get_ref`), the same surface the UI uses.
//!
//! `mode=list` / `mode=normal` return the flat row (foreign-key ids only);
//! `mode=detailed` nests every `HasOne` relation up to `depth` levels, so a
//! launch carries `status{}`, `launch_service_provider{}`, `pad{location{}}`,
//! `mission{orbit{}}`, etc. — matching LL2's detailed shape.

use ciborium::Value as Cbor;
use serde_json::{Map, Value as Json};
use vantage_types::Record;
use vantage_vista::{ReferenceKind, Vista};

/// Build the JSON object for `row`. With `detailed`, expand `HasOne` references
/// through `vista.get_ref(..)` (which narrows a fresh Vista to the related row)
/// up to `depth` levels deep.
pub async fn row_to_json(vista: &Vista, row: &Record<Cbor>, detailed: bool, depth: u8) -> Json {
    let mut map: Map<String, Json> = row
        .iter()
        .map(|(k, v)| (k.clone(), v.deserialized::<Json>().unwrap_or(Json::Null)))
        .collect();

    if detailed && depth > 0 {
        for (relation, kind) in vista.list_references() {
            if kind != ReferenceKind::HasOne {
                continue; // has-many is drilled separately by the UI, not embedded
            }
            let Ok(child) = vista.get_ref(&relation, row) else {
                continue;
            };
            let Ok(rows) = child.fetch_window(0, 1).await else {
                continue;
            };
            if let Some((_, child_row)) = rows.into_iter().next() {
                let nested = Box::pin(row_to_json(&child, &child_row, true, depth - 1)).await;
                map.insert(relation, nested);
            }
        }
    }

    Json::Object(map)
}
