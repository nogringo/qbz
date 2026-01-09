//! Tauri commands module
//!
//! Exposes backend functionality to the frontend via IPC

pub mod auth;
pub mod favorites;
pub mod playback;
pub mod playlist;
pub mod queue;
pub mod search;

pub use auth::*;
pub use favorites::*;
pub use playback::*;
pub use playlist::*;
pub use queue::*;
pub use search::*;
