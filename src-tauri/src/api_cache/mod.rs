//! API Response Cache
//!
//! SQLite-based cache for API responses (albums, artists, etc.)
//! with TTL-based expiration.

use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

/// API cache state shared across commands
pub struct ApiCacheState {
    pub cache: Arc<Mutex<ApiCache>>,
}

impl ApiCacheState {
    pub fn new() -> Result<Self, String> {
        let data_dir = dirs::data_dir()
            .ok_or("Could not determine data directory")?
            .join("qbz")
            .join("cache");

        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create cache directory: {}", e))?;

        let db_path = data_dir.join("api_cache.db");
        let cache = ApiCache::new(&db_path)?;

        log::info!("API cache initialized at {:?}", db_path);

        Ok(Self {
            cache: Arc::new(Mutex::new(cache)),
        })
    }
}

/// Default TTL for cached items (24 hours)
const DEFAULT_TTL_SECS: i64 = 24 * 60 * 60;

pub struct ApiCache {
    conn: Connection,
}

impl ApiCache {
    pub fn new(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path)
            .map_err(|e| format!("Failed to open API cache database: {}", e))?;
        let cache = Self { conn };
        cache.init()?;
        Ok(cache)
    }

    fn init(&self) -> Result<(), String> {
        self.conn
            .execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS cached_albums (
                    album_id TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    fetched_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_cached_albums_fetched ON cached_albums(fetched_at);

                CREATE TABLE IF NOT EXISTS cached_artists (
                    artist_id INTEGER PRIMARY KEY,
                    data TEXT NOT NULL,
                    fetched_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_cached_artists_fetched ON cached_artists(fetched_at);

                CREATE TABLE IF NOT EXISTS cached_tracks (
                    track_id INTEGER PRIMARY KEY,
                    data TEXT NOT NULL,
                    fetched_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_cached_tracks_fetched ON cached_tracks(fetched_at);
                "#,
            )
            .map_err(|e| format!("Failed to initialize API cache: {}", e))?;
        Ok(())
    }

    fn current_timestamp() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    }

    // ============ Album Cache ============

    /// Get a cached album if it exists and hasn't expired
    pub fn get_album(&self, album_id: &str, ttl_secs: Option<i64>) -> Result<Option<String>, String> {
        let ttl = ttl_secs.unwrap_or(DEFAULT_TTL_SECS);
        let min_fetched_at = Self::current_timestamp() - ttl;

        let result: Option<String> = self
            .conn
            .query_row(
                "SELECT data FROM cached_albums WHERE album_id = ? AND fetched_at > ?",
                params![album_id, min_fetched_at],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to query cached album: {}", e))?;

        Ok(result)
    }

    /// Cache an album response
    pub fn set_album(&self, album_id: &str, data: &str) -> Result<(), String> {
        let fetched_at = Self::current_timestamp();
        self.conn
            .execute(
                "INSERT OR REPLACE INTO cached_albums (album_id, data, fetched_at) VALUES (?, ?, ?)",
                params![album_id, data, fetched_at],
            )
            .map_err(|e| format!("Failed to cache album: {}", e))?;
        Ok(())
    }

    /// Get multiple cached albums at once
    pub fn get_albums(&self, album_ids: &[String], ttl_secs: Option<i64>) -> Result<Vec<(String, String)>, String> {
        if album_ids.is_empty() {
            return Ok(Vec::new());
        }

        let ttl = ttl_secs.unwrap_or(DEFAULT_TTL_SECS);
        let min_fetched_at = Self::current_timestamp() - ttl;

        let placeholders: Vec<&str> = album_ids.iter().map(|_| "?").collect();
        let query = format!(
            "SELECT album_id, data FROM cached_albums WHERE album_id IN ({}) AND fetched_at > ?",
            placeholders.join(",")
        );

        let mut stmt = self
            .conn
            .prepare(&query)
            .map_err(|e| format!("Failed to prepare cached albums query: {}", e))?;

        // Build params: album_ids + min_fetched_at
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = album_ids
            .iter()
            .map(|id| Box::new(id.clone()) as Box<dyn rusqlite::ToSql>)
            .collect();
        params_vec.push(Box::new(min_fetched_at));

        let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

        let rows = stmt
            .query_map(params_refs.as_slice(), |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("Failed to query cached albums: {}", e))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| format!("Failed to read cached album row: {}", e))?);
        }
        Ok(results)
    }

    // ============ Artist Cache ============

    /// Get a cached artist if it exists and hasn't expired
    pub fn get_artist(&self, artist_id: u64, ttl_secs: Option<i64>) -> Result<Option<String>, String> {
        let ttl = ttl_secs.unwrap_or(DEFAULT_TTL_SECS);
        let min_fetched_at = Self::current_timestamp() - ttl;

        let result: Option<String> = self
            .conn
            .query_row(
                "SELECT data FROM cached_artists WHERE artist_id = ? AND fetched_at > ?",
                params![artist_id, min_fetched_at],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to query cached artist: {}", e))?;

        Ok(result)
    }

    /// Cache an artist response
    pub fn set_artist(&self, artist_id: u64, data: &str) -> Result<(), String> {
        let fetched_at = Self::current_timestamp();
        self.conn
            .execute(
                "INSERT OR REPLACE INTO cached_artists (artist_id, data, fetched_at) VALUES (?, ?, ?)",
                params![artist_id, data, fetched_at],
            )
            .map_err(|e| format!("Failed to cache artist: {}", e))?;
        Ok(())
    }

    // ============ Track Cache ============

    /// Get a cached track if it exists and hasn't expired
    pub fn get_track(&self, track_id: u64, ttl_secs: Option<i64>) -> Result<Option<String>, String> {
        let ttl = ttl_secs.unwrap_or(DEFAULT_TTL_SECS);
        let min_fetched_at = Self::current_timestamp() - ttl;

        let result: Option<String> = self
            .conn
            .query_row(
                "SELECT data FROM cached_tracks WHERE track_id = ? AND fetched_at > ?",
                params![track_id, min_fetched_at],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to query cached track: {}", e))?;

        Ok(result)
    }

    /// Cache a track response
    pub fn set_track(&self, track_id: u64, data: &str) -> Result<(), String> {
        let fetched_at = Self::current_timestamp();
        self.conn
            .execute(
                "INSERT OR REPLACE INTO cached_tracks (track_id, data, fetched_at) VALUES (?, ?, ?)",
                params![track_id, data, fetched_at],
            )
            .map_err(|e| format!("Failed to cache track: {}", e))?;
        Ok(())
    }

    // ============ Maintenance ============

    /// Clear expired entries from all tables
    pub fn cleanup_expired(&self, ttl_secs: Option<i64>) -> Result<usize, String> {
        let ttl = ttl_secs.unwrap_or(DEFAULT_TTL_SECS);
        let min_fetched_at = Self::current_timestamp() - ttl;

        let mut total_deleted = 0;

        total_deleted += self
            .conn
            .execute(
                "DELETE FROM cached_albums WHERE fetched_at <= ?",
                params![min_fetched_at],
            )
            .map_err(|e| format!("Failed to cleanup cached albums: {}", e))?;

        total_deleted += self
            .conn
            .execute(
                "DELETE FROM cached_artists WHERE fetched_at <= ?",
                params![min_fetched_at],
            )
            .map_err(|e| format!("Failed to cleanup cached artists: {}", e))?;

        total_deleted += self
            .conn
            .execute(
                "DELETE FROM cached_tracks WHERE fetched_at <= ?",
                params![min_fetched_at],
            )
            .map_err(|e| format!("Failed to cleanup cached tracks: {}", e))?;

        Ok(total_deleted)
    }

    /// Clear all cached data
    pub fn clear_all(&self) -> Result<(), String> {
        self.conn
            .execute_batch(
                r#"
                DELETE FROM cached_albums;
                DELETE FROM cached_artists;
                DELETE FROM cached_tracks;
                "#,
            )
            .map_err(|e| format!("Failed to clear API cache: {}", e))?;
        Ok(())
    }
}
