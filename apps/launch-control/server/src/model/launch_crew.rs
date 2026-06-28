use crate::db::{AnyPostgresType, AnySqliteType, Db};
use vantage_table::prelude::IdGenerator;
use vantage_table::table::Table;
use vantage_types::entity;

use crate::model::{Astronaut, Launch};

/// Join between a launch and a crew member (a condensation: LL2 reaches crew via
/// `spacecraft_stage`, which is empty in the dev dataset, so launch↔astronaut
/// assignments are synthesized at seed time — see `seed.rs`).
#[entity(SqliteType, PostgresType)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct LaunchCrew {
    pub launch_id: Option<String>,
    pub astronaut_id: Option<String>,
    pub role: Option<String>,
}

impl LaunchCrew {
    pub fn table(db: Db) -> Table<Db, LaunchCrew> {
        Table::new("launch_crew", db)
            .with_id_column("id")
            .with_text_id()
            .with_generated_id(IdGenerator::UuidV7)
            .with_column_of::<Option<String>>("launch_id")
            .with_column_of::<Option<String>>("astronaut_id")
            .with_column_of::<Option<String>>("role")
            .with_one("launch", "launch_id", Launch::table)
            .with_one("astronaut", "astronaut_id", Astronaut::table)
    }
}
