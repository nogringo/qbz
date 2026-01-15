//! Authentication commands

use tauri::State;

use crate::credentials;
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

#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    let client = state.client.lock().await;
    client.logout().await;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct UserInfo {
    pub user_name: String,
    pub subscription: String,
}

#[tauri::command]
pub async fn get_user_info(state: State<'_, AppState>) -> Result<Option<UserInfo>, String> {
    let client = state.client.lock().await;
    Ok(client.get_user_info().await.map(|(name, sub)| UserInfo {
        user_name: name,
        subscription: sub,
    }))
}

// === Credential persistence commands ===

/// Check if saved credentials exist in system keyring
#[tauri::command]
pub fn has_saved_credentials() -> bool {
    credentials::has_saved_credentials()
}

/// Save credentials to system keyring
#[tauri::command]
pub fn save_credentials(email: String, password: String) -> Result<(), String> {
    credentials::save_qobuz_credentials(&email, &password)
}

/// Clear saved credentials from system keyring
#[tauri::command]
pub fn clear_saved_credentials() -> Result<(), String> {
    credentials::clear_qobuz_credentials()
}

/// Auto-login using saved credentials
/// Returns LoginResponse with success status
#[tauri::command]
pub async fn auto_login(state: State<'_, AppState>) -> Result<LoginResponse, String> {
    // Check for saved credentials
    let creds = match credentials::load_qobuz_credentials() {
        Ok(Some(c)) => c,
        Ok(None) => {
            return Ok(LoginResponse {
                success: false,
                user_name: None,
                subscription: None,
                error: Some("No saved credentials".to_string()),
            });
        }
        Err(e) => {
            return Ok(LoginResponse {
                success: false,
                user_name: None,
                subscription: None,
                error: Some(e),
            });
        }
    };

    // Try to login with saved credentials
    let client = state.client.lock().await;
    match client.login(&creds.email, &creds.password).await {
        Ok(session) => Ok(LoginResponse {
            success: true,
            user_name: Some(session.display_name),
            subscription: Some(session.subscription_label),
            error: None,
        }),
        Err(e) => {
            // Credentials might be invalid, but don't clear them automatically
            // Let the user decide
            log::warn!("Auto-login failed: {}", e);
            Ok(LoginResponse {
                success: false,
                user_name: None,
                subscription: None,
                error: Some(e.to_string()),
            })
        }
    }
}

#[tauri::command]
pub async fn set_api_locale(locale: String, state: State<'_, AppState>) -> Result<(), String> {
    log::info!("Command: set_api_locale {}", locale);
    let client = state.client.lock().await;
    client.set_locale(locale).await;
    Ok(())
}
