//! Audio caching module
//!
//! Provides in-memory caching for downloaded audio data:
//! - LRU cache with configurable size limit
//! - Pre-fetching of next track in queue
//! - Background download tasks

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

/// Cached audio data for a track
#[derive(Clone)]
pub struct CachedTrack {
    pub track_id: u64,
    pub data: Vec<u8>,
    pub size_bytes: usize,
}

/// Internal cache state - all in one struct to avoid deadlocks
struct CacheState {
    /// Cached tracks keyed by track ID
    tracks: HashMap<u64, CachedTrack>,
    /// Order of access for LRU eviction (most recent at back)
    access_order: Vec<u64>,
    /// Current cache size in bytes
    current_size: usize,
    /// Track IDs currently being fetched
    fetching: HashSet<u64>,
}

/// Audio cache manager with LRU eviction
pub struct AudioCache {
    state: Mutex<CacheState>,
    /// Maximum cache size in bytes (default: 200MB)
    max_size_bytes: usize,
}

impl Default for AudioCache {
    fn default() -> Self {
        Self::new(200 * 1024 * 1024) // 200MB default (reduced from 500MB for lower memory footprint)
    }
}

impl AudioCache {
    /// Create a new cache with specified max size in bytes
    pub fn new(max_size_bytes: usize) -> Self {
        Self {
            state: Mutex::new(CacheState {
                tracks: HashMap::new(),
                access_order: Vec::new(),
                current_size: 0,
                fetching: HashSet::new(),
            }),
            max_size_bytes,
        }
    }

    /// Get a track from cache if available
    pub fn get(&self, track_id: u64) -> Option<CachedTrack> {
        let mut state = self.state.lock().unwrap();

        let track = state.tracks.get(&track_id).cloned();

        if track.is_some() {
            // Update access order (move to back = most recently used)
            state.access_order.retain(|&id| id != track_id);
            state.access_order.push(track_id);
            log::debug!("Cache hit for track {}", track_id);
        } else {
            log::debug!("Cache miss for track {}", track_id);
        }

        track
    }

    /// Check if a track is in cache without updating access order
    pub fn contains(&self, track_id: u64) -> bool {
        self.state.lock().unwrap().tracks.contains_key(&track_id)
    }

    /// Check if a track is currently being fetched
    pub fn is_fetching(&self, track_id: u64) -> bool {
        self.state.lock().unwrap().fetching.contains(&track_id)
    }

    /// Mark a track as being fetched
    pub fn mark_fetching(&self, track_id: u64) {
        self.state.lock().unwrap().fetching.insert(track_id);
    }

    /// Unmark a track as being fetched
    pub fn unmark_fetching(&self, track_id: u64) {
        self.state.lock().unwrap().fetching.remove(&track_id);
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

        let mut state = self.state.lock().unwrap();

        // Evict old entries to make room
        while state.current_size + size > self.max_size_bytes && !state.access_order.is_empty() {
            let oldest_id = state.access_order.remove(0);
            if let Some(track) = state.tracks.remove(&oldest_id) {
                state.current_size = state.current_size.saturating_sub(track.size_bytes);
                log::debug!(
                    "Evicted track {} ({} bytes) from cache",
                    oldest_id,
                    track.size_bytes
                );
            }
        }

        // If track already exists, update size tracking
        if let Some(existing) = state.tracks.get(&track_id) {
            state.current_size = state.current_size.saturating_sub(existing.size_bytes);
        }

        let cached = CachedTrack {
            track_id,
            data,
            size_bytes: size,
        };

        state.tracks.insert(track_id, cached);
        state.current_size += size;

        // Update access order
        state.access_order.retain(|&id| id != track_id);
        state.access_order.push(track_id);

        log::info!(
            "Cached track {} ({} bytes). Cache size: {}/{} bytes",
            track_id,
            size,
            state.current_size,
            self.max_size_bytes
        );
    }

    /// Clear all cached data
    pub fn clear(&self) {
        let mut state = self.state.lock().unwrap();
        state.tracks.clear();
        state.access_order.clear();
        state.current_size = 0;
        state.fetching.clear();
        log::info!("Cache cleared");
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        let state = self.state.lock().unwrap();
        CacheStats {
            cached_tracks: state.tracks.len(),
            current_size_bytes: state.current_size,
            max_size_bytes: self.max_size_bytes,
            fetching_count: state.fetching.len(),
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
