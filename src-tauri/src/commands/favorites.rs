//! Favorites-related Tauri commands

use serde_json::Value;
use tauri::State;

use crate::AppState;

/// Get user's favorites
/// fav_type can be: "albums", "tracks", or "artists"
#[tauri::command]
pub async fn get_favorites(
    fav_type: String,
    limit: Option<u32>,
    offset: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    log::info!("Command: get_favorites type={} limit={:?} offset={:?}", fav_type, limit, offset);

    let client = state.client.lock().await;
    client
        .get_favorites(&fav_type, limit.unwrap_or(50), offset.unwrap_or(0))
        .await
        .map_err(|e| format!("Failed to get favorites: {}", e))
}

/// Add item to favorites
/// fav_type can be: "album", "track", or "artist"
#[tauri::command]
pub async fn add_favorite(
    fav_type: String,
    item_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Command: add_favorite type={} id={}", fav_type, item_id);

    let client = state.client.lock().await;
    client
        .add_favorite(&fav_type, &item_id)
        .await
        .map_err(|e| format!("Failed to add favorite: {}", e))
}

/// Remove item from favorites
/// fav_type can be: "album", "track", or "artist"
#[tauri::command]
pub async fn remove_favorite(
    fav_type: String,
    item_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Command: remove_favorite type={} id={}", fav_type, item_id);

    let client = state.client.lock().await;
    client
        .remove_favorite(&fav_type, &item_id)
        .await
        .map_err(|e| format!("Failed to remove favorite: {}", e))
}
