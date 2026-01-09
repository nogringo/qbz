//! QBZ-NIX: Native Qobuz client for Linux
//!
//! A high-fidelity music streaming client for Qobuz, designed for audiophiles
//! who need bit-perfect playback without browser sample rate limitations.

pub mod api;
pub mod commands;
pub mod config;
pub mod player;
pub mod queue;

use std::sync::Arc;
use tokio::sync::Mutex;

use api::QobuzClient;

/// Application state shared across commands
pub struct AppState {
    pub client: Arc<Mutex<QobuzClient>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(Mutex::new(QobuzClient::default())),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // Auth commands
            commands::init_client,
            commands::login,
            commands::is_logged_in,
            // Search commands
            commands::search_albums,
            commands::search_tracks,
            commands::search_artists,
            commands::get_album,
            commands::get_track,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
