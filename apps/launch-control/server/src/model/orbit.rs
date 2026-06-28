#[cfg(not(feature = "pg"))]
use crate::db::AnySqliteType;
#[cfg(feature = "pg")]
use crate::db::AnyPostgresType;
use crate::db::Db;
use vantage_table::table::Table;
use vantage_types::entity;

/// A mission's target orbit. LL2 `config/orbit` lookup.
#[cfg_attr(not(feature = "pg"), entity(SqliteType))]
#[cfg_attr(feature = "pg", entity(PostgresType))]
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Orbit {
    pub name: String,
    pub abbrev: String,
}

impl Orbit {
    pub fn table(db: Db) -> Table<Db, Orbit> {
        Table::new("orbits", db)
            .with_id_column("id")
            .with_text_id()
            .with_column_of::<String>("name")
            .with_column_of::<String>("abbrev")
    }
}
