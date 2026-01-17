//! Discogs API client for fetching album artwork
//!
//! Uses Cloudflare Workers proxy to search the Discogs database and download cover images.

use reqwest::Client;
use serde::Deserialize;
use std::fs;
use std::path::Path;
use std::time::Duration;

// Cloudflare Workers proxy URL - handles credentials
const DISCOGS_PROXY_URL: &str = "https://qbz-api-proxy.blitzkriegfc.workers.dev/discogs";

/// Discogs API client
pub struct DiscogsClient {
    client: Client,
}

/// Search result from Discogs API
#[derive(Debug, Deserialize, serde::Serialize, Clone)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
}

#[derive(Debug, Deserialize, serde::Serialize, Clone)]
pub struct SearchResult {
    pub id: u64,
    pub cover_image: Option<String>,
    pub thumb: Option<String>,
    pub title: String,
    #[serde(rename = "type")]
    pub result_type: String,
}

impl DiscogsClient {
    /// Create a new Discogs client (proxy handles credentials)
    pub fn new() -> Self {
        Self::with_user_credentials(None, None)
    }

    /// Create a new Discogs client - compatibility method (proxy handles credentials)
    pub fn with_user_credentials(
        _user_key: Option<String>,
        _user_secret: Option<String>,
    ) -> Self {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::USER_AGENT,
            reqwest::header::HeaderValue::from_static("QBZ/1.0.0"),
        );

        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .default_headers(headers)
            .build()
            .expect("Failed to create HTTP client");

        Self { client }
    }

    /// Check if credentials are configured (always true - proxy handles credentials)
    pub fn has_credentials(&self) -> bool {
        true
    }

    /// Search for album artwork and download if found
    /// Returns the path to the downloaded image or None
    pub async fn fetch_artwork(
        &self,
        artist: &str,
        album: &str,
        cache_dir: &Path,
    ) -> Option<String> {
        // Search for the release
        let cover_url = self.search_release(artist, album).await?;

        // Generate cache filename
        let filename = format!(
            "discogs_{:x}.jpg",
            Self::simple_hash(&format!("{}_{}", artist, album))
        );
        let cache_path = cache_dir.join(&filename);

        // Return cached if exists
        if cache_path.exists() {
            return Some(cache_path.to_string_lossy().to_string());
        }

        // Download the image
        self.download_image(&cover_url, &cache_path).await?;

        Some(cache_path.to_string_lossy().to_string())
    }

    /// Search for a release and return the cover image URL
    async fn search_release(&self, artist: &str, album: &str) -> Option<String> {
        // Build search query
        let query = format!("{} {}", artist, album);
        let url = format!(
            "{}/search?q={}&type=release",
            DISCOGS_PROXY_URL,
            urlencoding::encode(&query)
        );

        log::debug!("Searching Discogs for: {} - {}", artist, album);

        let response = self.client.get(&url).send().await.ok()?;

        if !response.status().is_success() {
            log::warn!("Discogs search failed with status: {}", response.status());
            return None;
        }

        let search: SearchResponse = response.json().await.ok()?;

        // Find first result with a cover image
        for result in search.results {
            if result.result_type == "release" || result.result_type == "master" {
                if let Some(cover) = result.cover_image {
                    if !cover.is_empty() && !cover.contains("spacer.gif") {
                        log::debug!("Found Discogs cover for {} - {}", artist, album);
                        return Some(cover);
                    }
                }
                // Fallback to thumbnail
                if let Some(thumb) = result.thumb {
                    if !thumb.is_empty() && !thumb.contains("spacer.gif") {
                        return Some(thumb);
                    }
                }
            }
        }

        log::debug!("No Discogs cover found for {} - {}", artist, album);
        None
    }

    /// Search for artists and return search results
    pub async fn search_artist(&self, query: &str) -> Result<SearchResponse, String> {
        let url = format!(
            "{}/search?q={}&type=artist",
            DISCOGS_PROXY_URL,
            urlencoding::encode(query)
        );

        log::debug!("Searching Discogs for artist: {}", query);

        let response = self.client.get(&url).send().await
            .map_err(|e| format!("Failed to search Discogs: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Discogs search failed with status: {}", response.status()));
        }

        let search: SearchResponse = response.json().await
            .map_err(|e| format!("Failed to parse Discogs response: {}", e))?;

        Ok(search)
    }

    /// Download an image to the cache directory
    async fn download_image(&self, image_url: &str, path: &Path) -> Option<()> {
        log::debug!("Downloading Discogs artwork: {}", image_url);

        // Use proxy to download image with authentication
        let proxy_url = format!(
            "{}/image?url={}",
            DISCOGS_PROXY_URL,
            urlencoding::encode(image_url)
        );

        let response = self
            .client
            .get(&proxy_url)
            .send()
            .await
            .ok()?;

        if !response.status().is_success() {
            log::warn!("Failed to download Discogs image: {}", response.status());
            return None;
        }

        let bytes = response.bytes().await.ok()?;

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).ok()?;
        }

        fs::write(path, &bytes).ok()?;

        log::info!("Saved Discogs artwork to: {}", path.display());
        Some(())
    }

    /// Simple hash function for generating filenames
    fn simple_hash(s: &str) -> u64 {
        let mut hash: u64 = 5381;
        for byte in s.bytes() {
            hash = hash.wrapping_mul(33).wrapping_add(byte as u64);
        }
        hash
    }
}

impl Default for DiscogsClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash() {
        let hash1 = DiscogsClient::simple_hash("Artist_Album");
        let hash2 = DiscogsClient::simple_hash("Artist_Album");
        assert_eq!(hash1, hash2);

        let hash3 = DiscogsClient::simple_hash("Different_Album");
        assert_ne!(hash1, hash3);
    }
}
