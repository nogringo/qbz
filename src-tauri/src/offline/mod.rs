//! Offline mode detection and settings
//!
//! Handles:
//! - Network connectivity detection
//! - Login state checking
//! - Manual offline mode toggle
//! - Offline settings persistence

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Reason why the app is in offline mode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum OfflineReason {
    NoNetwork,
    NotLoggedIn,
    ManualOverride,
}

/// Current offline status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineStatus {
    pub is_offline: bool,
    pub reason: Option<OfflineReason>,
    pub manual_mode_enabled: bool,
}

/// Persistent offline settings
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OfflineSettings {
    pub manual_offline_mode: bool,
    pub show_partial_playlists: bool,
}

/// SQLite-backed storage for offline settings
pub struct OfflineStore {
    conn: Connection,
}

impl OfflineStore {
    pub fn new() -> Result<Self, String> {
        let data_dir = dirs::data_dir()
            .ok_or("Could not determine data directory")?
            .join("qbz");

        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create data directory: {}", e))?;

        let db_path = data_dir.join("offline_settings.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open offline settings database: {}", e))?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS offline_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                manual_offline_mode INTEGER NOT NULL DEFAULT 0,
                show_partial_playlists INTEGER NOT NULL DEFAULT 1
            );
            INSERT OR IGNORE INTO offline_settings (id, manual_offline_mode, show_partial_playlists)
            VALUES (1, 0, 1);"
        ).map_err(|e| format!("Failed to create offline settings table: {}", e))?;

        Ok(Self { conn })
    }

    pub fn get_settings(&self) -> Result<OfflineSettings, String> {
        self.conn
            .query_row(
                "SELECT manual_offline_mode, show_partial_playlists FROM offline_settings WHERE id = 1",
                [],
                |row| {
                    Ok(OfflineSettings {
                        manual_offline_mode: row.get::<_, i64>(0)? != 0,
                        show_partial_playlists: row.get::<_, i64>(1)? != 0,
                    })
                },
            )
            .map_err(|e| format!("Failed to get offline settings: {}", e))
    }

    pub fn set_manual_offline_mode(&self, enabled: bool) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE offline_settings SET manual_offline_mode = ?1 WHERE id = 1",
                params![enabled as i64],
            )
            .map_err(|e| format!("Failed to set manual offline mode: {}", e))?;
        Ok(())
    }

    pub fn set_show_partial_playlists(&self, enabled: bool) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE offline_settings SET show_partial_playlists = ?1 WHERE id = 1",
                params![enabled as i64],
            )
            .map_err(|e| format!("Failed to set show partial playlists: {}", e))?;
        Ok(())
    }
}

/// Thread-safe wrapper for OfflineStore
pub struct OfflineState {
    pub store: Arc<Mutex<OfflineStore>>,
}

impl OfflineState {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            store: Arc::new(Mutex::new(OfflineStore::new()?)),
        })
    }
}

/// Check network connectivity by attempting to reach Qobuz API
pub async fn check_network_connectivity() -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build();

    let client = match client {
        Ok(c) => c,
        Err(_) => return false,
    };

    // Use HEAD request for minimal data transfer
    match client.head("https://www.qobuz.com").send().await {
        Ok(response) => response.status().is_success() || response.status().is_redirection(),
        Err(_) => false,
    }
}

// Tauri commands
pub mod commands {
    use super::*;
    use crate::AppState;
    use tauri::State;

    /// Get current offline status
    #[tauri::command]
    pub async fn get_offline_status(
        offline_state: State<'_, OfflineState>,
        app_state: State<'_, AppState>,
    ) -> Result<OfflineStatus, String> {
        let settings = {
            let store = offline_state.store.lock().map_err(|e| format!("Lock error: {}", e))?;
            store.get_settings()?
        };

        // If manual offline mode is enabled, return immediately
        if settings.manual_offline_mode {
            return Ok(OfflineStatus {
                is_offline: true,
                reason: Some(OfflineReason::ManualOverride),
                manual_mode_enabled: true,
            });
        }

        // Check if user is logged in
        let is_logged_in = {
            let client = app_state.client.lock().await;
            client.is_logged_in().await
        };

        if !is_logged_in {
            return Ok(OfflineStatus {
                is_offline: true,
                reason: Some(OfflineReason::NotLoggedIn),
                manual_mode_enabled: false,
            });
        }

        // Check network connectivity
        let has_network = check_network_connectivity().await;

        if !has_network {
            return Ok(OfflineStatus {
                is_offline: true,
                reason: Some(OfflineReason::NoNetwork),
                manual_mode_enabled: false,
            });
        }

        Ok(OfflineStatus {
            is_offline: false,
            reason: None,
            manual_mode_enabled: false,
        })
    }

    /// Get offline settings
    #[tauri::command]
    pub fn get_offline_settings(
        state: State<'_, OfflineState>,
    ) -> Result<OfflineSettings, String> {
        let store = state.store.lock().map_err(|e| format!("Lock error: {}", e))?;
        store.get_settings()
    }

    /// Enable or disable manual offline mode
    #[tauri::command]
    pub async fn set_manual_offline(
        enabled: bool,
        state: State<'_, OfflineState>,
        app_state: State<'_, AppState>,
        app_handle: AppHandle,
    ) -> Result<OfflineStatus, String> {
        {
            let store = state.store.lock().map_err(|e| format!("Lock error: {}", e))?;
            store.set_manual_offline_mode(enabled)?;
        }

        // Get updated status
        let status = get_offline_status(state, app_state).await?;

        // Emit event to frontend
        let _ = app_handle.emit("offline-status-changed", &status);

        Ok(status)
    }

    /// Set whether to show playlists with partial local content in offline mode
    #[tauri::command]
    pub fn set_show_partial_playlists(
        enabled: bool,
        state: State<'_, OfflineState>,
    ) -> Result<(), String> {
        let store = state.store.lock().map_err(|e| format!("Lock error: {}", e))?;
        store.set_show_partial_playlists(enabled)
    }
}
