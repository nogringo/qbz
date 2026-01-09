//! Favorites-related Tauri commands

use serde_json::Value;
use tauri::State;
use tokio::sync::Mutex;

use crate::api::client::QobuzClient;

/// Get user's favorites
/// fav_type can be: "albums", "tracks", or "artists"
#[tauri::command]
pub async fn get_favorites(
    fav_type: String,
    limit: Option<u32>,
    offset: Option<u32>,
    client: State<'_, std::sync::Arc<Mutex<QobuzClient>>>,
) -> Result<Value, String> {
    log::info!("Command: get_favorites type={} limit={:?} offset={:?}", fav_type, limit, offset);

    let client = client.lock().await;
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
    client: State<'_, std::sync::Arc<Mutex<QobuzClient>>>,
) -> Result<(), String> {
    log::info!("Command: add_favorite type={} id={}", fav_type, item_id);

    let client = client.lock().await;
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
    client: State<'_, std::sync::Arc<Mutex<QobuzClient>>>,
) -> Result<(), String> {
    log::info!("Command: remove_favorite type={} id={}", fav_type, item_id);

    let client = client.lock().await;
    client
        .remove_favorite(&fav_type, &item_id)
        .await
        .map_err(|e| format!("Failed to remove favorite: {}", e))
}
