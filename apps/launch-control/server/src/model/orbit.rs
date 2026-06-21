use vantage_sql::sqlite::{AnySqliteType, SqliteDB};
use vantage_table::table::Table;
use vantage_types::entity;

/// A mission's target orbit. LL2 `config/orbit` lookup.
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
