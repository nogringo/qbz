//! Tauri commands module
//!
//! Exposes backend functionality to the frontend via IPC

pub mod auth;
pub mod search;

pub use auth::*;
pub use search::*;
