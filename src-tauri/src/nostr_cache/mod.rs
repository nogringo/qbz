//! Nostr Event Cache
//!
//! SQLite-based cache for Nostr events (profiles, tracks, playlists)
//! with TTL-based expiration for local-first experience.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

/// Nostr cache state shared across commands
pub struct NostrCacheState {
    pub cache: Arc<Mutex<NostrCache>>,
}

impl NostrCacheState {
    pub fn new() -> Result<Self, String> {
        let data_dir = dirs::data_dir()
            .ok_or("Could not determine data directory")?
            .join("qbz")
            .join("cache");

        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create cache directory: {}", e))?;

        let db_path = data_dir.join("nostr_cache.db");
        let cache = NostrCache::new(&db_path)?;

        log::info!("Nostr cache initialized at {:?}", db_path);

        Ok(Self {
            cache: Arc::new(Mutex::new(cache)),
        })
    }
}

// ============ Cached Data Types ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedProfile {
    pub pubkey: String,
    pub name: Option<String>,
    pub display_name: Option<String>,
    pub picture: Option<String>,
    pub about: Option<String>,
    pub nip05: Option<String>,
    pub created_at: i64,
    pub fetched_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedTrack {
    pub event_id: String,
    pub pubkey: String,
    pub d_tag: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub url: String,
    pub image: Option<String>,
    pub duration: Option<i64>,
    pub genres: String, // JSON array
    pub created_at: i64,
    pub fetched_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedPlaylist {
    pub event_id: String,
    pub pubkey: String,
    pub d_tag: String,
    pub title: String,
    pub description: Option<String>,
    pub image: Option<String>,
    pub is_public: bool,
    pub track_refs: String, // JSON array
    pub created_at: i64,
    pub fetched_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedQuery {
    pub query_key: String,
    pub result_ids: String, // JSON array
    pub fetched_at: i64,
    pub expires_at: i64,
}

pub struct NostrCache {
    conn: Connection,
}

impl NostrCache {
    pub fn new(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path)
            .map_err(|e| format!("Failed to open Nostr cache database: {}", e))?;
        let cache = Self { conn };
        cache.init()?;
        Ok(cache)
    }

    fn init(&self) -> Result<(), String> {
        self.conn
            .execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS nostr_profiles (
                    pubkey TEXT PRIMARY KEY,
                    name TEXT,
                    display_name TEXT,
                    picture TEXT,
                    about TEXT,
                    nip05 TEXT,
                    created_at INTEGER NOT NULL,
                    fetched_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_nostr_profiles_fetched ON nostr_profiles(fetched_at);

                CREATE TABLE IF NOT EXISTS nostr_tracks (
                    event_id TEXT PRIMARY KEY,
                    pubkey TEXT NOT NULL,
                    d_tag TEXT NOT NULL,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    album TEXT,
                    url TEXT NOT NULL,
                    image TEXT,
                    duration INTEGER,
                    genres TEXT NOT NULL DEFAULT '[]',
                    created_at INTEGER NOT NULL,
                    fetched_at INTEGER NOT NULL,
                    UNIQUE(pubkey, d_tag)
                );
                CREATE INDEX IF NOT EXISTS idx_nostr_tracks_fetched ON nostr_tracks(fetched_at);
                CREATE INDEX IF NOT EXISTS idx_nostr_tracks_pubkey ON nostr_tracks(pubkey);
                CREATE INDEX IF NOT EXISTS idx_nostr_tracks_created ON nostr_tracks(created_at DESC);

                CREATE TABLE IF NOT EXISTS nostr_playlists (
                    event_id TEXT PRIMARY KEY,
                    pubkey TEXT NOT NULL,
                    d_tag TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    image TEXT,
                    is_public INTEGER NOT NULL DEFAULT 1,
                    track_refs TEXT NOT NULL DEFAULT '[]',
                    created_at INTEGER NOT NULL,
                    fetched_at INTEGER NOT NULL,
                    UNIQUE(pubkey, d_tag)
                );
                CREATE INDEX IF NOT EXISTS idx_nostr_playlists_fetched ON nostr_playlists(fetched_at);
                CREATE INDEX IF NOT EXISTS idx_nostr_playlists_pubkey ON nostr_playlists(pubkey);

                CREATE TABLE IF NOT EXISTS nostr_query_cache (
                    query_key TEXT PRIMARY KEY,
                    result_ids TEXT NOT NULL,
                    fetched_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_nostr_query_expires ON nostr_query_cache(expires_at);
                "#,
            )
            .map_err(|e| format!("Failed to initialize Nostr cache: {}", e))?;
        Ok(())
    }

    fn current_timestamp() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    }

    // ============ Profile Cache ============

    /// Get a cached profile (no TTL check - caller decides)
    pub fn get_profile(&self, pubkey: &str) -> Result<Option<CachedProfile>, String> {
        let result: Option<CachedProfile> = self
            .conn
            .query_row(
                "SELECT pubkey, name, display_name, picture, about, nip05, created_at, fetched_at
                 FROM nostr_profiles WHERE pubkey = ?",
                params![pubkey],
                |row| {
                    Ok(CachedProfile {
                        pubkey: row.get(0)?,
                        name: row.get(1)?,
                        display_name: row.get(2)?,
                        picture: row.get(3)?,
                        about: row.get(4)?,
                        nip05: row.get(5)?,
                        created_at: row.get(6)?,
                        fetched_at: row.get(7)?,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("Failed to query cached profile: {}", e))?;

        Ok(result)
    }

    /// Cache a profile
    pub fn set_profile(&self, profile: &CachedProfile) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO nostr_profiles
                 (pubkey, name, display_name, picture, about, nip05, created_at, fetched_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    profile.pubkey,
                    profile.name,
                    profile.display_name,
                    profile.picture,
                    profile.about,
                    profile.nip05,
                    profile.created_at,
                    profile.fetched_at,
                ],
            )
            .map_err(|e| format!("Failed to cache profile: {}", e))?;
        Ok(())
    }

    // ============ Track Cache ============

    /// Get a cached track by pubkey and d_tag
    pub fn get_track(&self, pubkey: &str, d_tag: &str) -> Result<Option<CachedTrack>, String> {
        let result: Option<CachedTrack> = self
            .conn
            .query_row(
                "SELECT event_id, pubkey, d_tag, title, artist, album, url, image, duration, genres, created_at, fetched_at
                 FROM nostr_tracks WHERE pubkey = ? AND d_tag = ?",
                params![pubkey, d_tag],
                |row| {
                    Ok(CachedTrack {
                        event_id: row.get(0)?,
                        pubkey: row.get(1)?,
                        d_tag: row.get(2)?,
                        title: row.get(3)?,
                        artist: row.get(4)?,
                        album: row.get(5)?,
                        url: row.get(6)?,
                        image: row.get(7)?,
                        duration: row.get(8)?,
                        genres: row.get(9)?,
                        created_at: row.get(10)?,
                        fetched_at: row.get(11)?,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("Failed to query cached track: {}", e))?;

        Ok(result)
    }

    /// Get tracks by pubkey (artist)
    pub fn get_tracks_by_pubkey(&self, pubkey: &str) -> Result<Vec<CachedTrack>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT event_id, pubkey, d_tag, title, artist, album, url, image, duration, genres, created_at, fetched_at
                 FROM nostr_tracks WHERE pubkey = ? ORDER BY created_at DESC",
            )
            .map_err(|e| format!("Failed to prepare tracks query: {}", e))?;

        let rows = stmt
            .query_map(params![pubkey], |row| {
                Ok(CachedTrack {
                    event_id: row.get(0)?,
                    pubkey: row.get(1)?,
                    d_tag: row.get(2)?,
                    title: row.get(3)?,
                    artist: row.get(4)?,
                    album: row.get(5)?,
                    url: row.get(6)?,
                    image: row.get(7)?,
                    duration: row.get(8)?,
                    genres: row.get(9)?,
                    created_at: row.get(10)?,
                    fetched_at: row.get(11)?,
                })
            })
            .map_err(|e| format!("Failed to query tracks: {}", e))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| format!("Failed to read track row: {}", e))?);
        }
        Ok(results)
    }

    /// Get recent tracks
    pub fn get_recent_tracks(&self, limit: i64) -> Result<Vec<CachedTrack>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT event_id, pubkey, d_tag, title, artist, album, url, image, duration, genres, created_at, fetched_at
                 FROM nostr_tracks ORDER BY created_at DESC LIMIT ?",
            )
            .map_err(|e| format!("Failed to prepare recent tracks query: {}", e))?;

        let rows = stmt
            .query_map(params![limit], |row| {
                Ok(CachedTrack {
                    event_id: row.get(0)?,
                    pubkey: row.get(1)?,
                    d_tag: row.get(2)?,
                    title: row.get(3)?,
                    artist: row.get(4)?,
                    album: row.get(5)?,
                    url: row.get(6)?,
                    image: row.get(7)?,
                    duration: row.get(8)?,
                    genres: row.get(9)?,
                    created_at: row.get(10)?,
                    fetched_at: row.get(11)?,
                })
            })
            .map_err(|e| format!("Failed to query recent tracks: {}", e))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| format!("Failed to read track row: {}", e))?);
        }
        Ok(results)
    }

    /// Cache a track
    pub fn set_track(&self, track: &CachedTrack) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO nostr_tracks
                 (event_id, pubkey, d_tag, title, artist, album, url, image, duration, genres, created_at, fetched_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    track.event_id,
                    track.pubkey,
                    track.d_tag,
                    track.title,
                    track.artist,
                    track.album,
                    track.url,
                    track.image,
                    track.duration,
                    track.genres,
                    track.created_at,
                    track.fetched_at,
                ],
            )
            .map_err(|e| format!("Failed to cache track: {}", e))?;
        Ok(())
    }

    /// Cache multiple tracks at once
    pub fn set_tracks(&self, tracks: &[CachedTrack]) -> Result<(), String> {
        for track in tracks {
            self.set_track(track)?;
        }
        Ok(())
    }

    // ============ Playlist Cache ============

    /// Get a cached playlist by pubkey and d_tag
    pub fn get_playlist(&self, pubkey: &str, d_tag: &str) -> Result<Option<CachedPlaylist>, String> {
        let result: Option<CachedPlaylist> = self
            .conn
            .query_row(
                "SELECT event_id, pubkey, d_tag, title, description, image, is_public, track_refs, created_at, fetched_at
                 FROM nostr_playlists WHERE pubkey = ? AND d_tag = ?",
                params![pubkey, d_tag],
                |row| {
                    Ok(CachedPlaylist {
                        event_id: row.get(0)?,
                        pubkey: row.get(1)?,
                        d_tag: row.get(2)?,
                        title: row.get(3)?,
                        description: row.get(4)?,
                        image: row.get(5)?,
                        is_public: row.get::<_, i64>(6)? != 0,
                        track_refs: row.get(7)?,
                        created_at: row.get(8)?,
                        fetched_at: row.get(9)?,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("Failed to query cached playlist: {}", e))?;

        Ok(result)
    }

    /// Get playlists by owner pubkey
    pub fn get_playlists_by_owner(&self, pubkey: &str) -> Result<Vec<CachedPlaylist>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT event_id, pubkey, d_tag, title, description, image, is_public, track_refs, created_at, fetched_at
                 FROM nostr_playlists WHERE pubkey = ? ORDER BY created_at DESC",
            )
            .map_err(|e| format!("Failed to prepare playlists query: {}", e))?;

        let rows = stmt
            .query_map(params![pubkey], |row| {
                Ok(CachedPlaylist {
                    event_id: row.get(0)?,
                    pubkey: row.get(1)?,
                    d_tag: row.get(2)?,
                    title: row.get(3)?,
                    description: row.get(4)?,
                    image: row.get(5)?,
                    is_public: row.get::<_, i64>(6)? != 0,
                    track_refs: row.get(7)?,
                    created_at: row.get(8)?,
                    fetched_at: row.get(9)?,
                })
            })
            .map_err(|e| format!("Failed to query playlists: {}", e))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| format!("Failed to read playlist row: {}", e))?);
        }
        Ok(results)
    }

    /// Cache a playlist
    pub fn set_playlist(&self, playlist: &CachedPlaylist) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO nostr_playlists
                 (event_id, pubkey, d_tag, title, description, image, is_public, track_refs, created_at, fetched_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    playlist.event_id,
                    playlist.pubkey,
                    playlist.d_tag,
                    playlist.title,
                    playlist.description,
                    playlist.image,
                    playlist.is_public as i64,
                    playlist.track_refs,
                    playlist.created_at,
                    playlist.fetched_at,
                ],
            )
            .map_err(|e| format!("Failed to cache playlist: {}", e))?;
        Ok(())
    }

    /// Delete a playlist from cache
    pub fn delete_playlist(&self, pubkey: &str, d_tag: &str) -> Result<(), String> {
        self.conn
            .execute(
                "DELETE FROM nostr_playlists WHERE pubkey = ? AND d_tag = ?",
                params![pubkey, d_tag],
            )
            .map_err(|e| format!("Failed to delete cached playlist: {}", e))?;
        Ok(())
    }

    // ============ Query Cache ============

    /// Get cached query result
    pub fn get_query(&self, query_key: &str) -> Result<Option<CachedQuery>, String> {
        let result: Option<CachedQuery> = self
            .conn
            .query_row(
                "SELECT query_key, result_ids, fetched_at, expires_at
                 FROM nostr_query_cache WHERE query_key = ?",
                params![query_key],
                |row| {
                    Ok(CachedQuery {
                        query_key: row.get(0)?,
                        result_ids: row.get(1)?,
                        fetched_at: row.get(2)?,
                        expires_at: row.get(3)?,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("Failed to query cached query: {}", e))?;

        Ok(result)
    }

    /// Cache a query result
    pub fn set_query(&self, query: &CachedQuery) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO nostr_query_cache
                 (query_key, result_ids, fetched_at, expires_at)
                 VALUES (?, ?, ?, ?)",
                params![
                    query.query_key,
                    query.result_ids,
                    query.fetched_at,
                    query.expires_at,
                ],
            )
            .map_err(|e| format!("Failed to cache query: {}", e))?;
        Ok(())
    }

    // ============ Maintenance ============

    /// Get cache statistics
    pub fn get_stats(&self) -> Result<CacheStats, String> {
        let profile_count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM nostr_profiles", [], |row| row.get(0))
            .map_err(|e| format!("Failed to count profiles: {}", e))?;

        let track_count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM nostr_tracks", [], |row| row.get(0))
            .map_err(|e| format!("Failed to count tracks: {}", e))?;

        let playlist_count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM nostr_playlists", [], |row| row.get(0))
            .map_err(|e| format!("Failed to count playlists: {}", e))?;

        let query_count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM nostr_query_cache", [], |row| row.get(0))
            .map_err(|e| format!("Failed to count queries: {}", e))?;

        Ok(CacheStats {
            profile_count,
            track_count,
            playlist_count,
            query_count,
        })
    }

    /// Clear expired query cache entries
    pub fn cleanup_expired_queries(&self) -> Result<usize, String> {
        let now = Self::current_timestamp();
        let deleted = self
            .conn
            .execute(
                "DELETE FROM nostr_query_cache WHERE expires_at <= ?",
                params![now],
            )
            .map_err(|e| format!("Failed to cleanup expired queries: {}", e))?;
        Ok(deleted)
    }

    /// Clear all cached data
    pub fn clear_all(&self) -> Result<(), String> {
        self.conn
            .execute_batch(
                r#"
                DELETE FROM nostr_profiles;
                DELETE FROM nostr_tracks;
                DELETE FROM nostr_playlists;
                DELETE FROM nostr_query_cache;
                "#,
            )
            .map_err(|e| format!("Failed to clear Nostr cache: {}", e))?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub profile_count: i64,
    pub track_count: i64,
    pub playlist_count: i64,
    pub query_count: i64,
}

// ============ Tauri Commands ============

#[tauri::command]
pub async fn nostr_cache_get_profile(
    state: tauri::State<'_, NostrCacheState>,
    pubkey: String,
) -> Result<Option<CachedProfile>, String> {
    let cache = state.cache.lock().await;
    cache.get_profile(&pubkey)
}

#[tauri::command]
pub async fn nostr_cache_set_profile(
    state: tauri::State<'_, NostrCacheState>,
    profile: CachedProfile,
) -> Result<(), String> {
    let cache = state.cache.lock().await;
    cache.set_profile(&profile)
}

#[tauri::command]
pub async fn nostr_cache_get_track(
    state: tauri::State<'_, NostrCacheState>,
    pubkey: String,
    d_tag: String,
) -> Result<Option<CachedTrack>, String> {
    let cache = state.cache.lock().await;
    cache.get_track(&pubkey, &d_tag)
}

#[tauri::command]
pub async fn nostr_cache_get_tracks_by_pubkey(
    state: tauri::State<'_, NostrCacheState>,
    pubkey: String,
) -> Result<Vec<CachedTrack>, String> {
    let cache = state.cache.lock().await;
    cache.get_tracks_by_pubkey(&pubkey)
}

#[tauri::command]
pub async fn nostr_cache_get_recent_tracks(
    state: tauri::State<'_, NostrCacheState>,
    limit: i64,
) -> Result<Vec<CachedTrack>, String> {
    let cache = state.cache.lock().await;
    cache.get_recent_tracks(limit)
}

#[tauri::command]
pub async fn nostr_cache_set_track(
    state: tauri::State<'_, NostrCacheState>,
    track: CachedTrack,
) -> Result<(), String> {
    let cache = state.cache.lock().await;
    cache.set_track(&track)
}

#[tauri::command]
pub async fn nostr_cache_set_tracks(
    state: tauri::State<'_, NostrCacheState>,
    tracks: Vec<CachedTrack>,
) -> Result<(), String> {
    let cache = state.cache.lock().await;
    cache.set_tracks(&tracks)
}

#[tauri::command]
pub async fn nostr_cache_get_playlist(
    state: tauri::State<'_, NostrCacheState>,
    pubkey: String,
    d_tag: String,
) -> Result<Option<CachedPlaylist>, String> {
    let cache = state.cache.lock().await;
    cache.get_playlist(&pubkey, &d_tag)
}

#[tauri::command]
pub async fn nostr_cache_get_playlists_by_owner(
    state: tauri::State<'_, NostrCacheState>,
    pubkey: String,
) -> Result<Vec<CachedPlaylist>, String> {
    let cache = state.cache.lock().await;
    cache.get_playlists_by_owner(&pubkey)
}

#[tauri::command]
pub async fn nostr_cache_set_playlist(
    state: tauri::State<'_, NostrCacheState>,
    playlist: CachedPlaylist,
) -> Result<(), String> {
    let cache = state.cache.lock().await;
    cache.set_playlist(&playlist)
}

#[tauri::command]
pub async fn nostr_cache_delete_playlist(
    state: tauri::State<'_, NostrCacheState>,
    pubkey: String,
    d_tag: String,
) -> Result<(), String> {
    let cache = state.cache.lock().await;
    cache.delete_playlist(&pubkey, &d_tag)
}

#[tauri::command]
pub async fn nostr_cache_get_query(
    state: tauri::State<'_, NostrCacheState>,
    query_key: String,
) -> Result<Option<CachedQuery>, String> {
    let cache = state.cache.lock().await;
    cache.get_query(&query_key)
}

#[tauri::command]
pub async fn nostr_cache_set_query(
    state: tauri::State<'_, NostrCacheState>,
    query: CachedQuery,
) -> Result<(), String> {
    let cache = state.cache.lock().await;
    cache.set_query(&query)
}

#[tauri::command]
pub async fn nostr_cache_get_stats(
    state: tauri::State<'_, NostrCacheState>,
) -> Result<CacheStats, String> {
    let cache = state.cache.lock().await;
    cache.get_stats()
}

#[tauri::command]
pub async fn nostr_cache_clear(
    state: tauri::State<'_, NostrCacheState>,
) -> Result<(), String> {
    let cache = state.cache.lock().await;
    cache.clear_all()
}
