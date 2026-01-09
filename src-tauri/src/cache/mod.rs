//! Audio caching module
//!
//! Provides in-memory caching for downloaded audio data:
//! - LRU cache with configurable size limit
//! - Pre-fetching of next track in queue
//! - Background download tasks

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

/// Cached audio data for a track
#[derive(Clone)]
pub struct CachedTrack {
    pub track_id: u64,
    pub data: Vec<u8>,
    pub size_bytes: usize,
}

/// Audio cache manager with LRU eviction
pub struct AudioCache {
    /// Cached tracks keyed by track ID
    cache: Mutex<HashMap<u64, CachedTrack>>,
    /// Order of access for LRU eviction (most recent at back)
    access_order: Mutex<Vec<u64>>,
    /// Maximum cache size in bytes (default: 500MB)
    max_size_bytes: usize,
    /// Current cache size in bytes
    current_size: Mutex<usize>,
    /// Track IDs currently being fetched
    fetching: Mutex<std::collections::HashSet<u64>>,
}

impl Default for AudioCache {
    fn default() -> Self {
        Self::new(500 * 1024 * 1024) // 500MB default
    }
}

impl AudioCache {
    /// Create a new cache with specified max size in bytes
    pub fn new(max_size_bytes: usize) -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
            access_order: Mutex::new(Vec::new()),
            max_size_bytes,
            current_size: Mutex::new(0),
            fetching: Mutex::new(std::collections::HashSet::new()),
        }
    }

    /// Get a track from cache if available
    pub fn get(&self, track_id: u64) -> Option<CachedTrack> {
        let cache = self.cache.lock().unwrap();
        if let Some(track) = cache.get(&track_id) {
            // Update access order (move to back = most recently used)
            let mut order = self.access_order.lock().unwrap();
            order.retain(|&id| id != track_id);
            order.push(track_id);

            log::debug!("Cache hit for track {}", track_id);
            Some(track.clone())
        } else {
            log::debug!("Cache miss for track {}", track_id);
            None
        }
    }

    /// Check if a track is in cache without updating access order
    pub fn contains(&self, track_id: u64) -> bool {
        self.cache.lock().unwrap().contains_key(&track_id)
    }

    /// Check if a track is currently being fetched
    pub fn is_fetching(&self, track_id: u64) -> bool {
        self.fetching.lock().unwrap().contains(&track_id)
    }

    /// Mark a track as being fetched
    pub fn mark_fetching(&self, track_id: u64) {
        self.fetching.lock().unwrap().insert(track_id);
    }

    /// Unmark a track as being fetched
    pub fn unmark_fetching(&self, track_id: u64) {
        self.fetching.lock().unwrap().remove(&track_id);
    }

    /// Insert a track into cache, evicting old entries if needed
    pub fn insert(&self, track_id: u64, data: Vec<u8>) {
        let size = data.len();

        // Don't cache if track is larger than max cache size
        if size > self.max_size_bytes {
            log::warn!(
                "Track {} ({} bytes) too large for cache (max {} bytes)",
                track_id,
                size,
                self.max_size_bytes
            );
            return;
        }

        // Evict old entries to make room
        self.evict_to_fit(size);

        let cached = CachedTrack {
            track_id,
            data,
            size_bytes: size,
        };

        let mut cache = self.cache.lock().unwrap();

        // If track already exists, update size tracking
        if let Some(existing) = cache.get(&track_id) {
            let mut current = self.current_size.lock().unwrap();
            *current = current.saturating_sub(existing.size_bytes);
        }

        cache.insert(track_id, cached);

        // Update size and access order
        *self.current_size.lock().unwrap() += size;
        let mut order = self.access_order.lock().unwrap();
        order.retain(|&id| id != track_id);
        order.push(track_id);

        log::info!(
            "Cached track {} ({} bytes). Cache size: {}/{} bytes",
            track_id,
            size,
            *self.current_size.lock().unwrap(),
            self.max_size_bytes
        );
    }

    /// Evict oldest entries until we have room for new_size bytes
    fn evict_to_fit(&self, new_size: usize) {
        let mut current = self.current_size.lock().unwrap();
        let mut cache = self.cache.lock().unwrap();
        let mut order = self.access_order.lock().unwrap();

        while *current + new_size > self.max_size_bytes && !order.is_empty() {
            // Remove oldest (front of order)
            let oldest_id = order.remove(0);
            if let Some(track) = cache.remove(&oldest_id) {
                *current = current.saturating_sub(track.size_bytes);
                log::debug!(
                    "Evicted track {} ({} bytes) from cache",
                    oldest_id,
                    track.size_bytes
                );
            }
        }
    }

    /// Clear all cached data
    pub fn clear(&self) {
        self.cache.lock().unwrap().clear();
        self.access_order.lock().unwrap().clear();
        *self.current_size.lock().unwrap() = 0;
        self.fetching.lock().unwrap().clear();
        log::info!("Cache cleared");
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            cached_tracks: self.cache.lock().unwrap().len(),
            current_size_bytes: *self.current_size.lock().unwrap(),
            max_size_bytes: self.max_size_bytes,
            fetching_count: self.fetching.lock().unwrap().len(),
        }
    }
}

/// Cache statistics
#[derive(Debug, Clone, serde::Serialize)]
pub struct CacheStats {
    pub cached_tracks: usize,
    pub current_size_bytes: usize,
    pub max_size_bytes: usize,
    pub fetching_count: usize,
}

/// Pre-fetcher for downloading next tracks in background
pub struct Prefetcher {
    /// Sender for prefetch requests
    tx: mpsc::Sender<PrefetchRequest>,
}

/// Request to prefetch a track
pub struct PrefetchRequest {
    pub track_id: u64,
    pub url: String,
}

impl Prefetcher {
    /// Create a new prefetcher with the given cache
    pub fn new(cache: Arc<AudioCache>) -> Self {
        let (tx, mut rx) = mpsc::channel::<PrefetchRequest>(10);

        // Spawn background task for prefetching
        tokio::spawn(async move {
            while let Some(request) = rx.recv().await {
                // Skip if already cached or being fetched
                if cache.contains(request.track_id) || cache.is_fetching(request.track_id) {
                    continue;
                }

                cache.mark_fetching(request.track_id);
                log::info!("Prefetching track {}...", request.track_id);

                match download_audio(&request.url).await {
                    Ok(data) => {
                        cache.insert(request.track_id, data);
                        log::info!("Prefetch complete for track {}", request.track_id);
                    }
                    Err(e) => {
                        log::warn!("Prefetch failed for track {}: {}", request.track_id, e);
                    }
                }

                cache.unmark_fetching(request.track_id);
            }
        });

        Self { tx }
    }

    /// Request prefetch of a track (non-blocking)
    pub fn prefetch(&self, track_id: u64, url: String) {
        let tx = self.tx.clone();
        tokio::spawn(async move {
            let _ = tx.send(PrefetchRequest { track_id, url }).await;
        });
    }
}

/// Download audio from URL
async fn download_audio(url: &str) -> Result<Vec<u8>, String> {
    use std::time::Duration;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch audio: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read audio bytes: {}", e))?;

    Ok(bytes.to_vec())
}
