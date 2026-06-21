//! Computed aggregate expressions (Phase 3).
//!
//! LL2 ships these as denormalized stored counts (`total_launch_count`,
//! `successful_launches`, payload mass totals, landing counts…). We store none
//! of them — they are recomputed here as correlated SQL subqueries via
//! `with_expression`, so the REST responses carry up-to-date stats that react to
//! the simulator without any write-back. Single-hop counts reuse the typed
//! `get_subquery_as(<relation>).get_count_query()` path; two-hop rollups
//! (payload mass, launches-per-location) are spelled out as raw correlated
//! subqueries.
//!
//! LL2 launch-status ids: 3 = success, 4/7 = failure, everything else pending.

use vantage_expressions::Expression;
use vantage_sql::prelude::SqliteOperation;
use vantage_sql::sqlite::{AnySqliteType, SqliteDB};
use vantage_sql::sqlite_expr;
use vantage_table::table::Table;
use vantage_types::Entity;

use crate::model::{Landing, Launch};

type Expr = Expression<AnySqliteType>;

/// Count of launches reached via the parent's `launches` relation.
pub fn launch_count<E: Entity<AnySqliteType> + 'static>(t: &Table<SqliteDB, E>) -> Expr {
    t.get_subquery_as::<Launch>("launches")
        .expect("parent has a `launches` relation")
        .get_count_query()
}

/// Launches that completed successfully (status 3).
pub fn successful_launches<E: Entity<AnySqliteType> + 'static>(t: &Table<SqliteDB, E>) -> Expr {
    let mut q = t
        .get_subquery_as::<Launch>("launches")
        .expect("parent has a `launches` relation");
    let cond = q["status_id"].eq("3");
    q.add_condition(cond);
    q.get_count_query()
}

/// Launches that failed (status 4) or partially failed (status 7).
pub fn failed_launches<E: Entity<AnySqliteType> + 'static>(t: &Table<SqliteDB, E>) -> Expr {
    let mut q = t
        .get_subquery_as::<Launch>("launches")
        .expect("parent has a `launches` relation");
    let cond = sqlite_expr!("{} IN ('4', '7')", (q["status_id"]));
    q.add_condition(cond);
    q.get_count_query()
}

/// Launches not yet resolved (anything that isn't a success or failure).
pub fn pending_launches<E: Entity<AnySqliteType> + 'static>(t: &Table<SqliteDB, E>) -> Expr {
    let mut q = t
        .get_subquery_as::<Launch>("launches")
        .expect("parent has a `launches` relation");
    let cond = sqlite_expr!("{} NOT IN ('3', '4', '7')", (q["status_id"]));
    q.add_condition(cond);
    q.get_count_query()
}

/// Count of landings reached via the parent's `landings` relation.
pub fn landing_count<E: Entity<AnySqliteType> + 'static>(t: &Table<SqliteDB, E>) -> Expr {
    t.get_subquery_as::<Landing>("landings")
        .expect("parent has a `landings` relation")
        .get_count_query()
}

/// Landings whose attempt resolved successfully.
pub fn successful_landings<E: Entity<AnySqliteType> + 'static>(t: &Table<SqliteDB, E>) -> Expr {
    let mut q = t
        .get_subquery_as::<Landing>("landings")
        .expect("parent has a `landings` relation");
    let cond = q["success"].eq(true);
    q.add_condition(cond);
    q.get_count_query()
}

/// Landings whose attempt resolved as a failure (`success = false`; unresolved
/// `NULL` attempts are excluded).
pub fn failed_landings<E: Entity<AnySqliteType> + 'static>(t: &Table<SqliteDB, E>) -> Expr {
    let mut q = t
        .get_subquery_as::<Landing>("landings")
        .expect("parent has a `landings` relation");
    let cond = q["success"].eq(false);
    q.add_condition(cond);
    q.get_count_query()
}
