//! Test-only: a throwaway file-backed SQLite database with the schema applied.
#![cfg(test)]

use tempfile::TempPath;
use crate::db::Db;

/// A temp DB whose backing file is deleted when this drops. `db` is declared
/// first so its pool closes before the file is removed.
pub struct TempDb {
    pub db: Db,
    _path: TempPath,
}

pub async fn temp_db() -> TempDb {
    let path = tempfile::NamedTempFile::new().unwrap().into_temp_path();
    let db = crate::db::connect(path.to_str().unwrap()).await.unwrap();
    crate::db::create_schema(&db).await.unwrap();
    TempDb { db, _path: path }
}
