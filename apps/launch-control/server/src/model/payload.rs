#[cfg(not(feature = "pg"))]
use crate::db::AnySqliteType;
#[cfg(feature = "pg")]
use crate::db::AnyPostgresType;
use crate::db::Db;
use vantage_table::prelude::IdGenerator;
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::{Agency, PayloadFlight, PayloadType};

/// A satellite / probe / cargo. Manufactured and operated by agencies; flown on
/// one or more launches via payload flights.
#[cfg_attr(not(feature = "pg"), entity(SqliteType))]
#[cfg_attr(feature = "pg", entity(PostgresType))]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Payload {
    pub name: String,
    pub type_id: Option<String>,
    pub manufacturer_id: Option<String>,
    pub operator_id: Option<String>,
    pub mass: Option<f64>,
    pub description: Option<String>,
    pub last_updated: Option<String>,
}

impl Payload {
    pub fn table(db: Db) -> Table<Db, Payload> {
        Table::new("payloads", db)
            .with_id_column("id")
            .with_text_id()
            .with_generated_id(IdGenerator::UuidV7)
            .with_column_of::<String>("name")
            .with_column_of::<Option<String>>("type_id")
            .with_column_of::<Option<String>>("manufacturer_id")
            .with_column_of::<Option<String>>("operator_id")
            .with_column_of::<Option<f64>>("mass")
            .with_column_of::<Option<String>>("description")
            .with_column_of::<Option<String>>("last_updated")
            .with_one("type", "type_id", PayloadType::table)
            .with_one("manufacturer", "manufacturer_id", Agency::table)
            .with_many("flights", "payload_id", PayloadFlight::table)
    }
}
