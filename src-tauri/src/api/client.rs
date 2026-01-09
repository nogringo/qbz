//! Qobuz API client implementation

use reqwest::{header, Client, StatusCode};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::auth::{get_timestamp, parse_login_response, sign_get_favorites, sign_get_file_url};
use super::bundle::{extract_bundle_tokens, BundleTokens};
use super::endpoints::{self, paths};
use super::error::{ApiError, Result};
use super::models::*;

const USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0";

/// Qobuz API client
pub struct QobuzClient {
    http: Client,
    tokens: Arc<RwLock<Option<BundleTokens>>>,
    session: Arc<RwLock<Option<UserSession>>>,
    validated_secret: Arc<RwLock<Option<String>>>,
}

impl QobuzClient {
    /// Create a new client
    pub fn new() -> Result<Self> {
        let http = Client::builder()
            .user_agent(USER_AGENT)
            .cookie_store(true)
            .build()?;

        Ok(Self {
            http,
            tokens: Arc::new(RwLock::new(None)),
            session: Arc::new(RwLock::new(None)),
            validated_secret: Arc::new(RwLock::new(None)),
        })
    }

    /// Initialize client by extracting bundle tokens
    pub async fn init(&self) -> Result<()> {
        let tokens = extract_bundle_tokens(&self.http).await?;
        *self.tokens.write().await = Some(tokens);
        Ok(())
    }

    /// Get app ID
    async fn app_id(&self) -> Result<String> {
        self.tokens
            .read()
            .await
            .as_ref()
            .map(|t| t.app_id.clone())
            .ok_or_else(|| ApiError::BundleExtractionError("Client not initialized".to_string()))
    }

    /// Get validated secret (validates on first use)
    async fn secret(&self) -> Result<String> {
        // Check if we already have a validated secret
        if let Some(secret) = self.validated_secret.read().await.clone() {
            return Ok(secret);
        }

        // Need to validate secrets
        let tokens = self.tokens.read().await;
        let tokens = tokens
            .as_ref()
            .ok_or_else(|| ApiError::BundleExtractionError("Client not initialized".to_string()))?;

        for secret in &tokens.secrets {
            if self.test_secret(secret).await? {
                *self.validated_secret.write().await = Some(secret.clone());
                return Ok(secret.clone());
            }
        }

        Err(ApiError::InvalidAppSecret)
    }

    /// Test if a secret is valid using a known track
    async fn test_secret(&self, secret: &str) -> Result<bool> {
        let test_track_id = 5966783u64; // Known test track
        let timestamp = get_timestamp();
        let signature = sign_get_file_url(test_track_id, 5, timestamp, secret);

        let url = endpoints::build_url(paths::TRACK_GET_FILE_URL);
        let response = self
            .http
            .get(&url)
            .header("X-App-Id", self.app_id().await?)
            .query(&[
                ("track_id", test_track_id.to_string()),
                ("format_id", "5".to_string()),
                ("intent", "stream".to_string()),
                ("request_ts", timestamp.to_string()),
                ("request_sig", signature),
            ])
            .send()
            .await?;

        Ok(response.status() != StatusCode::BAD_REQUEST)
    }

    /// Login with email and password
    pub async fn login(&self, email: &str, password: &str) -> Result<UserSession> {
        let url = endpoints::build_url(paths::USER_LOGIN);
        let response = self
            .http
            .post(&url)
            .header("X-App-Id", self.app_id().await?)
            .header(header::CONTENT_TYPE, "application/json")
            .form(&[("email", email), ("password", password)])
            .send()
            .await?;

        match response.status() {
            StatusCode::OK => {
                let json: Value = response.json().await?;
                let session = parse_login_response(&json)?;
                *self.session.write().await = Some(session.clone());
                Ok(session)
            }
            StatusCode::UNAUTHORIZED => {
                Err(ApiError::AuthenticationError("Invalid credentials".to_string()))
            }
            StatusCode::BAD_REQUEST => Err(ApiError::InvalidAppId),
            status => Err(ApiError::ApiResponse(format!("Unexpected status: {}", status))),
        }
    }

    /// Check if logged in
    pub async fn is_logged_in(&self) -> bool {
        self.session.read().await.is_some()
    }

    /// Get user auth token header value
    async fn auth_token(&self) -> Result<String> {
        self.session
            .read()
            .await
            .as_ref()
            .map(|s| s.user_auth_token.clone())
            .ok_or_else(|| ApiError::AuthenticationError("Not logged in".to_string()))
    }

    // === Search endpoints ===

    /// Search for albums
    pub async fn search_albums(&self, query: &str, limit: u32) -> Result<SearchResultsPage<Album>> {
        let url = endpoints::build_url(paths::ALBUM_SEARCH);
        let response: Value = self
            .http
            .get(&url)
            .header("X-App-Id", self.app_id().await?)
            .query(&[("query", query), ("limit", &limit.to_string())])
            .send()
            .await?
            .json()
            .await?;

        let albums = response
            .get("albums")
            .ok_or_else(|| ApiError::ApiResponse("No albums in response".to_string()))?;

        Ok(serde_json::from_value(albums.clone())?)
    }

    /// Search for tracks
    pub async fn search_tracks(&self, query: &str, limit: u32) -> Result<SearchResultsPage<Track>> {
        let url = endpoints::build_url(paths::TRACK_SEARCH);
        let response: Value = self
            .http
            .get(&url)
            .header("X-App-Id", self.app_id().await?)
            .query(&[("query", query), ("limit", &limit.to_string())])
            .send()
            .await?
            .json()
            .await?;

        let tracks = response
            .get("tracks")
            .ok_or_else(|| ApiError::ApiResponse("No tracks in response".to_string()))?;

        Ok(serde_json::from_value(tracks.clone())?)
    }

    /// Search for artists
    pub async fn search_artists(&self, query: &str, limit: u32) -> Result<SearchResultsPage<Artist>> {
        let url = endpoints::build_url(paths::ARTIST_SEARCH);
        let response: Value = self
            .http
            .get(&url)
            .header("X-App-Id", self.app_id().await?)
            .query(&[("query", query), ("limit", &limit.to_string())])
            .send()
            .await?
            .json()
            .await?;

        let artists = response
            .get("artists")
            .ok_or_else(|| ApiError::ApiResponse("No artists in response".to_string()))?;

        Ok(serde_json::from_value(artists.clone())?)
    }

    // === Get endpoints ===

    /// Get album by ID
    pub async fn get_album(&self, album_id: &str) -> Result<Album> {
        let url = endpoints::build_url(paths::ALBUM_GET);
        let response: Value = self
            .http
            .get(&url)
            .header("X-App-Id", self.app_id().await?)
            .query(&[("album_id", album_id)])
            .send()
            .await?
            .json()
            .await?;

        Ok(serde_json::from_value(response)?)
    }

    /// Get track by ID
    pub async fn get_track(&self, track_id: u64) -> Result<Track> {
        let url = endpoints::build_url(paths::TRACK_GET);
        let response: Value = self
            .http
            .get(&url)
            .header("X-App-Id", self.app_id().await?)
            .query(&[("track_id", track_id.to_string())])
            .send()
            .await?
            .json()
            .await?;

        Ok(serde_json::from_value(response)?)
    }

    /// Get artist by ID
    pub async fn get_artist(&self, artist_id: u64, with_albums: bool) -> Result<Artist> {
        let url = endpoints::build_url(paths::ARTIST_GET);
        let mut query = vec![("artist_id", artist_id.to_string())];
        if with_albums {
            query.push(("extra", "albums".to_string()));
        }

        let response: Value = self
            .http
            .get(&url)
            .header("X-App-Id", self.app_id().await?)
            .query(&query)
            .send()
            .await?
            .json()
            .await?;

        Ok(serde_json::from_value(response)?)
    }

    /// Get playlist by ID
    pub async fn get_playlist(&self, playlist_id: u64) -> Result<Playlist> {
        let url = endpoints::build_url(paths::PLAYLIST_GET);
        let response: Value = self
            .http
            .get(&url)
            .header("X-App-Id", self.app_id().await?)
            .query(&[("playlist_id", playlist_id.to_string()), ("limit", "500".to_string())])
            .send()
            .await?
            .json()
            .await?;

        Ok(serde_json::from_value(response)?)
    }

    // === Authenticated endpoints ===

    /// Get stream URL for a track (requires auth + signature)
    pub async fn get_stream_url(&self, track_id: u64, quality: Quality) -> Result<StreamUrl> {
        let url = endpoints::build_url(paths::TRACK_GET_FILE_URL);
        let timestamp = get_timestamp();
        let secret = self.secret().await?;
        let signature = sign_get_file_url(track_id, quality.id(), timestamp, &secret);

        let response = self
            .http
            .get(&url)
            .header("X-App-Id", self.app_id().await?)
            .header("X-User-Auth-Token", self.auth_token().await?)
            .query(&[
                ("track_id", track_id.to_string()),
                ("format_id", quality.id().to_string()),
                ("intent", "stream".to_string()),
                ("request_ts", timestamp.to_string()),
                ("request_sig", signature),
            ])
            .send()
            .await?;

        match response.status() {
            StatusCode::OK => {
                let json: Value = response.json().await?;

                // Check for restrictions
                let restrictions: Vec<StreamRestriction> = json
                    .get("restrictions")
                    .and_then(|v| serde_json::from_value(v.clone()).ok())
                    .unwrap_or_default();

                Ok(StreamUrl {
                    url: json["url"].as_str().unwrap_or("").to_string(),
                    format_id: json["format_id"].as_u64().unwrap_or(0) as u32,
                    mime_type: json["mime_type"].as_str().unwrap_or("").to_string(),
                    sampling_rate: json["sampling_rate"].as_f64().unwrap_or(0.0),
                    bit_depth: json["bit_depth"].as_u64().map(|v| v as u32),
                    track_id,
                    restrictions,
                })
            }
            StatusCode::BAD_REQUEST => Err(ApiError::InvalidAppSecret),
            status => Err(ApiError::ApiResponse(format!("Unexpected status: {}", status))),
        }
    }

    /// Get stream URL with quality fallback
    pub async fn get_stream_url_with_fallback(
        &self,
        track_id: u64,
        preferred: Quality,
    ) -> Result<StreamUrl> {
        let qualities = Quality::fallback_order();
        let start_idx = qualities.iter().position(|q| *q == preferred).unwrap_or(0);

        for quality in &qualities[start_idx..] {
            match self.get_stream_url(track_id, *quality).await {
                Ok(url) if !url.has_restrictions() => return Ok(url),
                Ok(_) => continue, // Format restricted, try lower
                Err(ApiError::InvalidAppSecret) => return Err(ApiError::InvalidAppSecret),
                Err(_) => continue,
            }
        }

        Err(ApiError::NoQualityAvailable)
    }

    /// Get user favorites (requires auth + signature)
    pub async fn get_favorites(&self, fav_type: &str, limit: u32, offset: u32) -> Result<Value> {
        let url = endpoints::build_url(paths::FAVORITE_GET_USER_FAVORITES);
        let timestamp = get_timestamp();
        let secret = self.secret().await?;
        let signature = sign_get_favorites(timestamp, &secret);

        let response: Value = self
            .http
            .get(&url)
            .header("X-App-Id", self.app_id().await?)
            .header("X-User-Auth-Token", self.auth_token().await?)
            .query(&[
                ("type", fav_type),
                ("limit", &limit.to_string()),
                ("offset", &offset.to_string()),
                ("request_ts", &timestamp.to_string()),
                ("request_sig", &signature),
            ])
            .send()
            .await?
            .json()
            .await?;

        Ok(response)
    }

    /// Get user's playlists
    pub async fn get_user_playlists(&self) -> Result<Vec<Playlist>> {
        let url = endpoints::build_url(paths::PLAYLIST_GET_USER_PLAYLISTS);
        let response: Value = self
            .http
            .get(&url)
            .header("X-App-Id", self.app_id().await?)
            .header("X-User-Auth-Token", self.auth_token().await?)
            .send()
            .await?
            .json()
            .await?;

        let playlists = response
            .get("playlists")
            .and_then(|p| p.get("items"))
            .ok_or_else(|| ApiError::ApiResponse("No playlists in response".to_string()))?;

        Ok(serde_json::from_value(playlists.clone())?)
    }
}

impl Default for QobuzClient {
    fn default() -> Self {
        Self::new().expect("Failed to create client")
    }
}
