//! LL2 `config/*` lookup tables. Small reference sets (id + name, sometimes an
//! abbreviation/description) that the core entities point at via a foreign key
//! and that `?mode=detailed` re-nests as `{ id, name, … }` objects.

#[cfg(not(feature = "pg"))]
use crate::db::AnySqliteType;
#[cfg(feature = "pg")]
use crate::db::AnyPostgresType;
use crate::db::Db;
use vantage_table::table::Table;
use vantage_types::entity;

/// Lookups carrying name + abbrev + description (status-like).
macro_rules! described_lookup {
    ($struct:ident, $table:literal) => {
        #[cfg_attr(not(feature = "pg"), entity(SqliteType))]
        #[cfg_attr(feature = "pg", entity(PostgresType))]
        #[derive(Debug, Clone, PartialEq, Default)]
        pub struct $struct {
            pub name: String,
            pub abbrev: String,
            pub description: String,
        }
        impl $struct {
            pub fn table(db: Db) -> Table<Db, $struct> {
                Table::new($table, db)
                    .with_id_column("id")
            .with_text_id()
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
        #[cfg_attr(not(feature = "pg"), entity(SqliteType))]
        #[cfg_attr(feature = "pg", entity(PostgresType))]
        #[derive(Debug, Clone, PartialEq, Default)]
        pub struct $struct {
            pub name: String,
        }
        impl $struct {
            pub fn table(db: Db) -> Table<Db, $struct> {
                Table::new($table, db)
                    .with_id_column("id")
            .with_text_id()
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
