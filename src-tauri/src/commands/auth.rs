//! Authentication commands

use tauri::State;

use crate::AppState;

#[derive(serde::Serialize)]
pub struct LoginResponse {
    pub success: bool,
    pub user_name: Option<String>,
    pub subscription: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn login(
    email: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<LoginResponse, String> {
    let client = state.client.lock().await;

    match client.login(&email, &password).await {
        Ok(session) => Ok(LoginResponse {
            success: true,
            user_name: Some(session.display_name),
            subscription: Some(session.subscription_label),
            error: None,
        }),
        Err(e) => Ok(LoginResponse {
            success: false,
            user_name: None,
            subscription: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn is_logged_in(state: State<'_, AppState>) -> Result<bool, String> {
    let client = state.client.lock().await;
    Ok(client.is_logged_in().await)
}

#[tauri::command]
pub async fn init_client(state: State<'_, AppState>) -> Result<bool, String> {
    let client = state.client.lock().await;
    match client.init().await {
        Ok(_) => Ok(true),
        Err(e) => Err(e.to_string()),
    }
}
