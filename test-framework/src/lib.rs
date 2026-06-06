//! Black-box BDD engine for the vantage-ui app.
//!
//! The crate is split into a small library (the reusable engine — World, MCP
//! client, process launcher, shared steps) and a `vantage-ui-test` binary
//! (the driver that selects apps and runs cucumber against them).
//!
//! This repo is strictly black-box: it launches the published vantage-ui
//! binary and drives it over MCP. It never links vantage-ui source and must
//! not use gpui / `TestAppContext` (see `.rules`).

pub mod launcher;
pub mod mcp_client;
pub mod world;

// NOTE: step definitions live in the *binary* crate (`src/steps/`), not here.
// cucumber registers steps via the `inventory` crate; keeping them in the
// binary that builds the `Cucumber` runner guarantees their registrations are
// linked into the final executable (cross-crate `inventory` from an rlib can
// be dropped by the linker).
