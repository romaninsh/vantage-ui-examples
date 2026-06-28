use crate::db::{AnyPostgresType, AnySqliteType, Db};
use vantage_table::prelude::IdGenerator;
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::{Launch, Payload};

/// Join between a launch and a payload (one row per payload carried on a flight).
/// The source for per-launch payload aggregation (count, total mass).
#[entity(SqliteType, PostgresType)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct PayloadFlight {
    pub launch_id: Option<String>,
    pub payload_id: Option<String>,
    pub destination: Option<String>,
    pub amount: Option<i64>,
    pub last_updated: Option<String>,
}

impl PayloadFlight {
    pub fn table(db: Db) -> Table<Db, PayloadFlight> {
        Table::new("payload_flights", db)
            .with_id_column("id")
            .with_text_id()
            .with_generated_id(IdGenerator::UuidV7)
            .with_column_of::<Option<String>>("launch_id")
            .with_column_of::<Option<String>>("payload_id")
            .with_column_of::<Option<String>>("destination")
            .with_column_of::<Option<i64>>("amount")
            .with_column_of::<Option<String>>("last_updated")
            .with_one("launch", "launch_id", Launch::table)
            .with_one("payload", "payload_id", Payload::table)
    }
}
