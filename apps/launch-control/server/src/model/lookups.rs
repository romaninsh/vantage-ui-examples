//! LL2 `config/*` lookup tables. Small reference sets (id + name, sometimes an
//! abbreviation/description) that the core entities point at via a foreign key
//! and that `?mode=detailed` re-nests as `{ id, name, … }` objects.

use vantage_sql::sqlite::{AnySqliteType, SqliteDB};
use vantage_table::table::Table;
use vantage_types::entity;

/// Lookups carrying name + abbrev + description (status-like).
macro_rules! described_lookup {
    ($struct:ident, $table:literal) => {
        #[entity(SqliteType)]
        #[derive(Debug, Clone, PartialEq, Default)]
        pub struct $struct {
            pub name: String,
            pub abbrev: String,
            pub description: String,
        }
        impl $struct {
            pub fn table(db: SqliteDB) -> Table<SqliteDB, $struct> {
                Table::new($table, db)
                    .with_id_column("id")
                    .with_column_of::<String>("name")
                    .with_column_of::<String>("abbrev")
                    .with_column_of::<String>("description")
            }
        }
    };
}

/// Lookups carrying name only.
macro_rules! named_lookup {
    ($struct:ident, $table:literal) => {
        #[entity(SqliteType)]
        #[derive(Debug, Clone, PartialEq, Default)]
        pub struct $struct {
            pub name: String,
        }
        impl $struct {
            pub fn table(db: SqliteDB) -> Table<SqliteDB, $struct> {
                Table::new($table, db)
                    .with_id_column("id")
                    .with_column_of::<String>("name")
            }
        }
    };
}

described_lookup!(LaunchStatus, "launch_statuses");
described_lookup!(NetPrecision, "net_precisions");
described_lookup!(LandingType, "landing_types");

named_lookup!(AgencyType, "agency_types");
named_lookup!(PayloadType, "payload_types");
named_lookup!(LauncherStatus, "launcher_statuses");
named_lookup!(AstronautStatus, "astronaut_statuses");
named_lookup!(AstronautType, "astronaut_types");

#[entity(SqliteType)]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Orbit {
    pub name: String,
    pub abbrev: String,
}

impl Orbit {
    pub fn table(db: SqliteDB) -> Table<SqliteDB, Orbit> {
        Table::new("orbits", db)
            .with_id_column("id")
            .with_column_of::<String>("name")
            .with_column_of::<String>("abbrev")
    }
}
