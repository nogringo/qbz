# Local Library Implementation - Codex Tasks

> **IMPORTANT**: Work ONLY in the worktree at `../qbz-local-library`
> **BRANCH**: `local-library`
> **DO NOT** modify any files outside `src-tauri/src/library/`

## Overview

You are implementing a LOCAL MUSIC LIBRARY feature for QBZ, a Tauri 2.0 + Rust music player.
The main codebase has Qobuz streaming which you MUST NOT touch.

## Task Order

Complete these tasks IN ORDER. Each task builds on the previous one.

1. [Task 1: Scanner Module](#task-1-scanner-module)
2. [Task 2: Metadata Extraction](#task-2-metadata-extraction)
3. [Task 3: CUE Sheet Parser](#task-3-cue-sheet-parser)
4. [Task 4: SQLite Database](#task-4-sqlite-database)
5. [Task 5: Tauri Commands](#task-5-tauri-commands)

## Commit Discipline

- Commit after EVERY completed function
- Run `cargo check` before every commit
- Format: `feat(library): description`
- Never commit broken code

## Files You Will Create

```
src-tauri/src/library/
├── mod.rs           # Module exports
├── errors.rs        # Error types
├── models.rs        # Data structures
├── scanner.rs       # Directory scanning
├── metadata.rs      # Tag extraction
├── cue_parser.rs    # CUE sheet parsing
├── database.rs      # SQLite persistence
└── commands.rs      # Tauri commands
```

## Files You MUST NOT Touch

```
FORBIDDEN - DO NOT MODIFY:
- src-tauri/src/api/
- src-tauri/src/commands/
- src-tauri/src/queue/
- src-tauri/src/cache/
- src-tauri/src/lastfm/
- src-tauri/src/share/
- src-tauri/src/config/
- src-tauri/src/player/
- src-tauri/src/media_controls/
- src-tauri/src/lib.rs
- src/ (frontend)
- Any existing file
```

---

# TASK 1: Scanner Module

## Goal
Create the foundation: module structure, error types, data models, and directory scanner.

## Step 1: Add dependencies to Cargo.toml

Add these to `[dependencies]` section in `src-tauri/Cargo.toml`:

```toml
walkdir = "2"
lofty = "0.18"
rusqlite = { version = "0.31", features = ["bundled"] }
dirs = "5"
```

## Step 2: Create src-tauri/src/library/errors.rs

```rust
//! Library error types

use thiserror::Error;

#[derive(Error, Debug)]
pub enum LibraryError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Metadata error: {0}")]
    Metadata(String),

    #[error("CUE parse error: {0}")]
    CueParse(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),
}
```

## Step 3: Create src-tauri/src/library/models.rs

```rust
//! Data models for local library

use serde::{Deserialize, Serialize};

/// Supported audio formats
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AudioFormat {
    Flac,
    Alac,
    Wav,
    Aiff,
    Ape,
    Unknown,
}

impl Default for AudioFormat {
    fn default() -> Self {
        Self::Unknown
    }
}

impl std::fmt::Display for AudioFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AudioFormat::Flac => write!(f, "FLAC"),
            AudioFormat::Alac => write!(f, "ALAC"),
            AudioFormat::Wav => write!(f, "WAV"),
            AudioFormat::Aiff => write!(f, "AIFF"),
            AudioFormat::Ape => write!(f, "APE"),
            AudioFormat::Unknown => write!(f, "Unknown"),
        }
    }
}

/// A track from the local library
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalTrack {
    pub id: i64,
    pub file_path: String,

    // Metadata
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,

    // Audio properties
    pub duration_secs: u64,
    pub format: AudioFormat,
    pub bit_depth: Option<u32>,
    pub sample_rate: u32,
    pub channels: u8,
    pub file_size_bytes: u64,

    // CUE support
    pub cue_file_path: Option<String>,
    pub cue_start_secs: Option<f64>,
    pub cue_end_secs: Option<f64>,

    // Artwork
    pub artwork_path: Option<String>,

    // Indexing
    pub last_modified: i64,
    pub indexed_at: i64,
}

impl Default for LocalTrack {
    fn default() -> Self {
        Self {
            id: 0,
            file_path: String::new(),
            title: String::new(),
            artist: "Unknown Artist".to_string(),
            album: "Unknown Album".to_string(),
            album_artist: None,
            track_number: None,
            disc_number: None,
            year: None,
            genre: None,
            duration_secs: 0,
            format: AudioFormat::Unknown,
            bit_depth: None,
            sample_rate: 44100,
            channels: 2,
            file_size_bytes: 0,
            cue_file_path: None,
            cue_start_secs: None,
            cue_end_secs: None,
            artwork_path: None,
            last_modified: 0,
            indexed_at: 0,
        }
    }
}

/// An album aggregated from local tracks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalAlbum {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub year: Option<u32>,
    pub artwork_path: Option<String>,
    pub track_count: u32,
    pub total_duration_secs: u64,
    pub format: AudioFormat,
    pub directory_path: String,
}

/// An artist aggregated from local tracks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalArtist {
    pub name: String,
    pub album_count: u32,
    pub track_count: u32,
}

/// Scan progress for UI updates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub status: ScanStatus,
    pub total_files: u32,
    pub processed_files: u32,
    pub current_file: Option<String>,
    pub errors: Vec<ScanError>,
}

impl Default for ScanProgress {
    fn default() -> Self {
        Self {
            status: ScanStatus::Idle,
            total_files: 0,
            processed_files: 0,
            current_file: None,
            errors: Vec::new(),
        }
    }
}

/// Scan status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ScanStatus {
    Idle,
    Scanning,
    Complete,
    Error,
}

/// A scan error for a specific file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanError {
    pub file_path: String,
    pub error: String,
}

/// Audio properties extracted from a file
#[derive(Debug, Clone, Default)]
pub struct AudioProperties {
    pub duration_secs: u64,
    pub bit_depth: Option<u32>,
    pub sample_rate: u32,
    pub channels: u8,
}
```

## Step 4: Create src-tauri/src/library/scanner.rs

```rust
//! Filesystem scanner for audio files

use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::library::LibraryError;

/// Supported audio file extensions
const SUPPORTED_AUDIO_EXTENSIONS: &[&str] = &["flac", "m4a", "wav", "aiff", "aif", "ape"];

/// CUE file extension
const CUE_EXTENSION: &str = "cue";

/// Result of scanning a directory
#[derive(Debug, Default)]
pub struct ScanResult {
    /// Audio files found
    pub audio_files: Vec<PathBuf>,
    /// CUE files found
    pub cue_files: Vec<PathBuf>,
}

/// Library scanner for discovering audio files
pub struct LibraryScanner;

impl LibraryScanner {
    /// Create a new scanner
    pub fn new() -> Self {
        Self
    }

    /// Scan a directory recursively for audio and CUE files
    pub fn scan_directory(&self, path: &Path) -> Result<ScanResult, LibraryError> {
        if !path.exists() {
            return Err(LibraryError::InvalidPath(format!(
                "Path does not exist: {}",
                path.display()
            )));
        }

        if !path.is_dir() {
            return Err(LibraryError::InvalidPath(format!(
                "Path is not a directory: {}",
                path.display()
            )));
        }

        let mut result = ScanResult::default();

        for entry in WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();

            if !path.is_file() {
                continue;
            }

            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();

                if Self::is_supported_audio_extension(&ext_lower) {
                    result.audio_files.push(path.to_path_buf());
                } else if ext_lower == CUE_EXTENSION {
                    result.cue_files.push(path.to_path_buf());
                }
            }
        }

        log::info!(
            "Scanned {}: found {} audio files, {} CUE files",
            path.display(),
            result.audio_files.len(),
            result.cue_files.len()
        );

        Ok(result)
    }

    /// Check if an extension is a supported audio format
    fn is_supported_audio_extension(ext: &str) -> bool {
        SUPPORTED_AUDIO_EXTENSIONS.contains(&ext)
    }

    /// Get all supported extensions (for UI display)
    pub fn supported_extensions() -> &'static [&'static str] {
        SUPPORTED_AUDIO_EXTENSIONS
    }
}

impl Default for LibraryScanner {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_supported_extensions() {
        assert!(LibraryScanner::is_supported_audio_extension("flac"));
        assert!(LibraryScanner::is_supported_audio_extension("wav"));
        assert!(LibraryScanner::is_supported_audio_extension("m4a"));
        assert!(!LibraryScanner::is_supported_audio_extension("mp3"));
        assert!(!LibraryScanner::is_supported_audio_extension("txt"));
    }
}
```

## Step 5: Create src-tauri/src/library/mod.rs

```rust
//! Local music library module
//!
//! Provides functionality for scanning, indexing, and playing local audio files.
//! This module is completely independent of the Qobuz streaming functionality.

pub mod errors;
pub mod models;
pub mod scanner;

pub use errors::LibraryError;
pub use models::*;
pub use scanner::{LibraryScanner, ScanResult};
```

## Verification

```bash
cd src-tauri
cargo check
```

## Commit

```bash
git add src-tauri/src/library/
git add src-tauri/Cargo.toml
git commit -m "feat(library): add scanner module with models and error types"
```

---

# TASK 2: Metadata Extraction

## Goal
Extract audio metadata (tags, properties) from files using the `lofty` crate.

## Create src-tauri/src/library/metadata.rs

```rust
//! Metadata extraction for audio files

use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::library::{AudioFormat, AudioProperties, LibraryError, LocalTrack};

/// Metadata extractor using lofty
pub struct MetadataExtractor;

impl MetadataExtractor {
    /// Extract metadata from an audio file
    pub fn extract(file_path: &Path) -> Result<LocalTrack, LibraryError> {
        log::debug!("Extracting metadata from: {}", file_path.display());

        // Probe the file
        let tagged_file = Probe::open(file_path)
            .map_err(|e| LibraryError::Metadata(format!("Failed to open file: {}", e)))?
            .read()
            .map_err(|e| LibraryError::Metadata(format!("Failed to read file: {}", e)))?;

        // Get the primary tag (prefer ID3v2/Vorbis/APE)
        let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());

        // Get audio properties
        let properties = tagged_file.properties();
        let duration_secs = properties.duration().as_secs();
        let sample_rate = properties.sample_rate().unwrap_or(44100);
        let bit_depth = properties.bit_depth().map(|b| b as u32);
        let channels = properties.channels().unwrap_or(2) as u8;

        // Get file metadata
        let file_metadata = fs::metadata(file_path)
            .map_err(|e| LibraryError::Io(e))?;
        let file_size_bytes = file_metadata.len();
        let last_modified = file_metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        // Detect format
        let format = Self::detect_format(file_path);

        // Get filename for fallback title
        let filename = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();

        // Build track
        let track = if let Some(tag) = tag {
            LocalTrack {
                id: 0,
                file_path: file_path.to_string_lossy().to_string(),
                title: tag.title().map(|s| s.to_string()).unwrap_or(filename),
                artist: tag.artist().map(|s| s.to_string()).unwrap_or_else(|| "Unknown Artist".to_string()),
                album: tag.album().map(|s| s.to_string()).unwrap_or_else(|| "Unknown Album".to_string()),
                album_artist: tag.get_string(&ItemKey::AlbumArtist).map(|s| s.to_string()),
                track_number: tag.track().map(|t| t as u32),
                disc_number: tag.disk().map(|d| d as u32),
                year: tag.year().map(|y| y as u32),
                genre: tag.genre().map(|s| s.to_string()),
                duration_secs,
                format,
                bit_depth,
                sample_rate,
                channels,
                file_size_bytes,
                cue_file_path: None,
                cue_start_secs: None,
                cue_end_secs: None,
                artwork_path: None,
                last_modified,
                indexed_at: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0),
            }
        } else {
            // No tag found, use defaults
            LocalTrack {
                id: 0,
                file_path: file_path.to_string_lossy().to_string(),
                title: filename,
                artist: "Unknown Artist".to_string(),
                album: "Unknown Album".to_string(),
                album_artist: None,
                track_number: None,
                disc_number: None,
                year: None,
                genre: None,
                duration_secs,
                format,
                bit_depth,
                sample_rate,
                channels,
                file_size_bytes,
                cue_file_path: None,
                cue_start_secs: None,
                cue_end_secs: None,
                artwork_path: None,
                last_modified,
                indexed_at: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0),
            }
        };

        Ok(track)
    }

    /// Extract audio properties without full metadata
    pub fn extract_properties(file_path: &Path) -> Result<AudioProperties, LibraryError> {
        let tagged_file = Probe::open(file_path)
            .map_err(|e| LibraryError::Metadata(format!("Failed to open file: {}", e)))?
            .read()
            .map_err(|e| LibraryError::Metadata(format!("Failed to read file: {}", e)))?;

        let properties = tagged_file.properties();

        Ok(AudioProperties {
            duration_secs: properties.duration().as_secs(),
            bit_depth: properties.bit_depth().map(|b| b as u32),
            sample_rate: properties.sample_rate().unwrap_or(44100),
            channels: properties.channels().unwrap_or(2) as u8,
        })
    }

    /// Determine AudioFormat from file extension
    pub fn detect_format(path: &Path) -> AudioFormat {
        match path.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()).as_deref() {
            Some("flac") => AudioFormat::Flac,
            Some("m4a") => AudioFormat::Alac,
            Some("wav") => AudioFormat::Wav,
            Some("aiff") | Some("aif") => AudioFormat::Aiff,
            Some("ape") => AudioFormat::Ape,
            _ => AudioFormat::Unknown,
        }
    }

    /// Extract and save artwork to cache directory
    /// Returns path to saved artwork or None
    pub fn extract_artwork(file_path: &Path, cache_dir: &Path) -> Option<String> {
        let tagged_file = Probe::open(file_path).ok()?.read().ok()?;
        let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag())?;

        let picture = tag.pictures().first()?;

        // Generate filename from hash of file path
        let hash = Self::simple_hash(&file_path.to_string_lossy());
        let ext = match picture.mime_type() {
            Some(lofty::picture::MimeType::Png) => "png",
            Some(lofty::picture::MimeType::Jpeg) => "jpg",
            Some(lofty::picture::MimeType::Gif) => "gif",
            Some(lofty::picture::MimeType::Bmp) => "bmp",
            _ => "jpg",
        };

        let artwork_filename = format!("{:x}.{}", hash, ext);
        let artwork_path = cache_dir.join(&artwork_filename);

        // Skip if already exists
        if artwork_path.exists() {
            return Some(artwork_path.to_string_lossy().to_string());
        }

        // Ensure cache dir exists
        fs::create_dir_all(cache_dir).ok()?;

        // Write artwork
        fs::write(&artwork_path, picture.data()).ok()?;

        Some(artwork_path.to_string_lossy().to_string())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_format() {
        assert_eq!(MetadataExtractor::detect_format(Path::new("test.flac")), AudioFormat::Flac);
        assert_eq!(MetadataExtractor::detect_format(Path::new("test.m4a")), AudioFormat::Alac);
        assert_eq!(MetadataExtractor::detect_format(Path::new("test.wav")), AudioFormat::Wav);
        assert_eq!(MetadataExtractor::detect_format(Path::new("test.mp3")), AudioFormat::Unknown);
    }
}
```

## Update mod.rs

Add to `src-tauri/src/library/mod.rs`:

```rust
pub mod metadata;
pub use metadata::MetadataExtractor;
```

## Verification

```bash
cargo check
```

## Commit

```bash
git add src-tauri/src/library/metadata.rs
git add src-tauri/src/library/mod.rs
git commit -m "feat(library): add metadata extraction with lofty"
```

---

# TASK 3: CUE Sheet Parser

## Goal
Parse CUE sheets to support single-file albums split into virtual tracks.

## Create src-tauri/src/library/cue_parser.rs

```rust
//! CUE sheet parser for single-file albums

use std::fs;
use std::path::Path;

use crate::library::{AudioFormat, AudioProperties, LibraryError, LocalTrack};

/// Parsed CUE sheet
#[derive(Debug, Clone)]
pub struct CueSheet {
    /// Path to the .cue file
    pub file_path: String,
    /// Referenced audio file (resolved to absolute path)
    pub audio_file: String,
    /// Album title
    pub title: Option<String>,
    /// Album performer/artist
    pub performer: Option<String>,
    /// Tracks in the CUE sheet
    pub tracks: Vec<CueTrack>,
}

/// A track within a CUE sheet
#[derive(Debug, Clone)]
pub struct CueTrack {
    /// Track number
    pub number: u32,
    /// Track title
    pub title: String,
    /// Track performer (if different from album)
    pub performer: Option<String>,
    /// Start time in seconds
    pub start_secs: f64,
}

/// CUE time format (MM:SS:FF where FF is frames, 75 frames per second)
#[derive(Debug, Clone, Copy)]
pub struct CueTime {
    pub minutes: u32,
    pub seconds: u32,
    pub frames: u32,
}

impl CueTime {
    /// Convert to seconds (frames are 1/75 second)
    pub fn to_seconds(&self) -> f64 {
        self.minutes as f64 * 60.0 + self.seconds as f64 + self.frames as f64 / 75.0
    }

    /// Parse "MM:SS:FF" format
    pub fn parse(s: &str) -> Option<Self> {
        let parts: Vec<&str> = s.split(':').collect();
        if parts.len() != 3 {
            return None;
        }
        Some(CueTime {
            minutes: parts[0].parse().ok()?,
            seconds: parts[1].parse().ok()?,
            frames: parts[2].parse().ok()?,
        })
    }
}

/// CUE sheet parser
pub struct CueParser;

impl CueParser {
    /// Parse a CUE file
    pub fn parse(cue_path: &Path) -> Result<CueSheet, LibraryError> {
        log::debug!("Parsing CUE file: {}", cue_path.display());

        // Try UTF-8 first, then fall back to Latin-1
        let content = fs::read_to_string(cue_path).or_else(|_| {
            let bytes = fs::read(cue_path)?;
            Ok::<String, std::io::Error>(bytes.iter().map(|&b| b as char).collect())
        })?;

        Self::parse_content(&content, cue_path)
    }

    /// Parse CUE content
    fn parse_content(content: &str, cue_path: &Path) -> Result<CueSheet, LibraryError> {
        let mut sheet = CueSheet {
            file_path: cue_path.to_string_lossy().to_string(),
            audio_file: String::new(),
            title: None,
            performer: None,
            tracks: Vec::new(),
        };

        let mut current_track: Option<CueTrack> = None;
        let mut in_track = false;

        for line in content.lines() {
            let line = line.trim();

            // Skip empty lines and comments
            if line.is_empty() || line.starts_with("REM") {
                continue;
            }

            // Parse FILE "name" TYPE
            if line.to_uppercase().starts_with("FILE ") {
                if let Some(filename) = Self::extract_quoted(line) {
                    // Resolve path relative to CUE file
                    if let Some(parent) = cue_path.parent() {
                        let audio_path = parent.join(&filename);
                        sheet.audio_file = audio_path.to_string_lossy().to_string();
                    } else {
                        sheet.audio_file = filename;
                    }
                }
            }
            // Parse album-level TITLE (before any TRACK)
            else if line.to_uppercase().starts_with("TITLE ") && !in_track {
                sheet.title = Self::extract_quoted(line);
            }
            // Parse album-level PERFORMER (before any TRACK)
            else if line.to_uppercase().starts_with("PERFORMER ") && !in_track {
                sheet.performer = Self::extract_quoted(line);
            }
            // Parse TRACK NN AUDIO
            else if line.to_uppercase().starts_with("TRACK ") {
                // Save previous track
                if let Some(track) = current_track.take() {
                    sheet.tracks.push(track);
                }

                // Start new track
                in_track = true;
                if let Some(num) = Self::extract_track_number(line) {
                    current_track = Some(CueTrack {
                        number: num,
                        title: format!("Track {}", num),
                        performer: None,
                        start_secs: 0.0,
                    });
                }
            }
            // Parse track TITLE
            else if line.to_uppercase().starts_with("TITLE ") && in_track {
                if let Some(ref mut track) = current_track {
                    if let Some(title) = Self::extract_quoted(line) {
                        track.title = title;
                    }
                }
            }
            // Parse track PERFORMER
            else if line.to_uppercase().starts_with("PERFORMER ") && in_track {
                if let Some(ref mut track) = current_track {
                    track.performer = Self::extract_quoted(line);
                }
            }
            // Parse INDEX 01 MM:SS:FF (track start time)
            else if line.to_uppercase().starts_with("INDEX 01 ") {
                if let Some(ref mut track) = current_track {
                    let time_str = line
                        .get(9..)
                        .map(|s| s.trim())
                        .unwrap_or("");
                    if let Some(time) = CueTime::parse(time_str) {
                        track.start_secs = time.to_seconds();
                    }
                }
            }
        }

        // Don't forget the last track
        if let Some(track) = current_track {
            sheet.tracks.push(track);
        }

        // Validate we have an audio file and at least one track
        if sheet.audio_file.is_empty() {
            return Err(LibraryError::CueParse(
                "No FILE directive found in CUE sheet".to_string(),
            ));
        }

        if sheet.tracks.is_empty() {
            return Err(LibraryError::CueParse(
                "No tracks found in CUE sheet".to_string(),
            ));
        }

        log::info!(
            "Parsed CUE: {} tracks, audio file: {}",
            sheet.tracks.len(),
            sheet.audio_file
        );

        Ok(sheet)
    }

    /// Extract quoted string: COMMAND "value" -> value
    fn extract_quoted(line: &str) -> Option<String> {
        let start = line.find('"')?;
        let end = line.rfind('"')?;
        if end <= start {
            return None;
        }
        Some(line[start + 1..end].to_string())
    }

    /// Extract track number: "TRACK 01 AUDIO" -> 1
    fn extract_track_number(line: &str) -> Option<u32> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 2 {
            return None;
        }
        parts[1].parse().ok()
    }
}

/// Convert a CUE sheet into LocalTrack entries
pub fn cue_to_tracks(
    cue: &CueSheet,
    audio_duration_secs: u64,
    format: AudioFormat,
    properties: &AudioProperties,
) -> Vec<LocalTrack> {
    let mut tracks = Vec::new();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    for (i, cue_track) in cue.tracks.iter().enumerate() {
        // Calculate end time (next track's start or audio end)
        let end_secs = if i + 1 < cue.tracks.len() {
            cue.tracks[i + 1].start_secs
        } else {
            audio_duration_secs as f64
        };

        let duration = (end_secs - cue_track.start_secs).max(0.0) as u64;

        tracks.push(LocalTrack {
            id: 0,
            file_path: cue.audio_file.clone(),
            title: cue_track.title.clone(),
            artist: cue_track
                .performer
                .clone()
                .or_else(|| cue.performer.clone())
                .unwrap_or_else(|| "Unknown Artist".to_string()),
            album: cue
                .title
                .clone()
                .unwrap_or_else(|| "Unknown Album".to_string()),
            album_artist: cue.performer.clone(),
            track_number: Some(cue_track.number),
            disc_number: None,
            year: None,
            genre: None,
            duration_secs: duration,
            format: format.clone(),
            bit_depth: properties.bit_depth,
            sample_rate: properties.sample_rate,
            channels: properties.channels,
            file_size_bytes: 0,
            cue_file_path: Some(cue.file_path.clone()),
            cue_start_secs: Some(cue_track.start_secs),
            cue_end_secs: Some(end_secs),
            artwork_path: None,
            last_modified: 0,
            indexed_at: now,
        });
    }

    tracks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cue_time_parse() {
        let time = CueTime::parse("03:45:22").unwrap();
        assert_eq!(time.minutes, 3);
        assert_eq!(time.seconds, 45);
        assert_eq!(time.frames, 22);

        let secs = time.to_seconds();
        assert!((secs - 225.293).abs() < 0.01);
    }

    #[test]
    fn test_extract_quoted() {
        assert_eq!(
            CueParser::extract_quoted("TITLE \"My Song\""),
            Some("My Song".to_string())
        );
        assert_eq!(
            CueParser::extract_quoted("FILE \"album.flac\" WAVE"),
            Some("album.flac".to_string())
        );
    }

    #[test]
    fn test_extract_track_number() {
        assert_eq!(CueParser::extract_track_number("TRACK 01 AUDIO"), Some(1));
        assert_eq!(CueParser::extract_track_number("TRACK 12 AUDIO"), Some(12));
    }
}
```

## Update mod.rs

Add to exports:

```rust
pub mod cue_parser;
pub use cue_parser::{CueParser, CueSheet, CueTrack, cue_to_tracks};
```

## Commit

```bash
git add src-tauri/src/library/cue_parser.rs
git add src-tauri/src/library/mod.rs
git commit -m "feat(library): add CUE sheet parser for single-file albums"
```

---

# TASK 4: SQLite Database

## Goal
Persist the library index in SQLite for fast queries.

## Create src-tauri/src/library/database.rs

```rust
//! SQLite database layer for library persistence

use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

use crate::library::{AudioFormat, LibraryError, LocalAlbum, LocalArtist, LocalTrack};

/// Library database wrapper
pub struct LibraryDatabase {
    conn: Connection,
}

impl LibraryDatabase {
    /// Open or create database at path
    pub fn open(db_path: &Path) -> Result<Self, LibraryError> {
        log::info!("Opening library database at: {}", db_path.display());

        let conn = Connection::open(db_path)
            .map_err(|e| LibraryError::Database(format!("Failed to open database: {}", e)))?;

        // Enable WAL mode for better concurrent access
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| LibraryError::Database(format!("Failed to set WAL mode: {}", e)))?;

        let db = Self { conn };
        db.init_schema()?;
        Ok(db)
    }

    /// Create tables if they don't exist
    fn init_schema(&self) -> Result<(), LibraryError> {
        self.conn
            .execute_batch(
                r#"
            CREATE TABLE IF NOT EXISTS library_folders (
                id INTEGER PRIMARY KEY,
                path TEXT UNIQUE NOT NULL,
                enabled INTEGER DEFAULT 1,
                last_scan INTEGER
            );

            CREATE TABLE IF NOT EXISTS local_tracks (
                id INTEGER PRIMARY KEY,
                file_path TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT NOT NULL,
                album_artist TEXT,
                track_number INTEGER,
                disc_number INTEGER,
                year INTEGER,
                genre TEXT,
                duration_secs INTEGER NOT NULL,
                format TEXT NOT NULL,
                bit_depth INTEGER,
                sample_rate INTEGER NOT NULL,
                channels INTEGER NOT NULL,
                file_size_bytes INTEGER NOT NULL,
                cue_file_path TEXT,
                cue_start_secs REAL,
                cue_end_secs REAL,
                artwork_path TEXT,
                last_modified INTEGER NOT NULL,
                indexed_at INTEGER NOT NULL,
                UNIQUE(file_path, cue_start_secs)
            );

            CREATE INDEX IF NOT EXISTS idx_tracks_artist ON local_tracks(artist);
            CREATE INDEX IF NOT EXISTS idx_tracks_album ON local_tracks(album);
            CREATE INDEX IF NOT EXISTS idx_tracks_album_artist ON local_tracks(album_artist);
            CREATE INDEX IF NOT EXISTS idx_tracks_file_path ON local_tracks(file_path);
            CREATE INDEX IF NOT EXISTS idx_tracks_title ON local_tracks(title);
        "#,
            )
            .map_err(|e| LibraryError::Database(format!("Failed to create schema: {}", e)))?;

        Ok(())
    }

    // === Folder Management ===

    /// Add a folder to the library
    pub fn add_folder(&self, path: &str) -> Result<(), LibraryError> {
        self.conn
            .execute(
                "INSERT OR IGNORE INTO library_folders (path) VALUES (?)",
                params![path],
            )
            .map_err(|e| LibraryError::Database(e.to_string()))?;
        Ok(())
    }

    /// Remove a folder from the library
    pub fn remove_folder(&self, path: &str) -> Result<(), LibraryError> {
        self.conn
            .execute("DELETE FROM library_folders WHERE path = ?", params![path])
            .map_err(|e| LibraryError::Database(e.to_string()))?;
        Ok(())
    }

    /// Get all enabled library folders
    pub fn get_folders(&self) -> Result<Vec<String>, LibraryError> {
        let mut stmt = self
            .conn
            .prepare("SELECT path FROM library_folders WHERE enabled = 1")
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        let mut folders = Vec::new();
        for path in rows {
            folders.push(path.map_err(|e| LibraryError::Database(e.to_string()))?);
        }
        Ok(folders)
    }

    /// Update last scan time for a folder
    pub fn update_folder_scan_time(&self, path: &str, timestamp: i64) -> Result<(), LibraryError> {
        self.conn
            .execute(
                "UPDATE library_folders SET last_scan = ? WHERE path = ?",
                params![timestamp, path],
            )
            .map_err(|e| LibraryError::Database(e.to_string()))?;
        Ok(())
    }

    // === Track Management ===

    /// Insert or update a track
    pub fn insert_track(&self, track: &LocalTrack) -> Result<i64, LibraryError> {
        self.conn
            .execute(
                r#"INSERT OR REPLACE INTO local_tracks
               (file_path, title, artist, album, album_artist, track_number,
                disc_number, year, genre, duration_secs, format, bit_depth,
                sample_rate, channels, file_size_bytes, cue_file_path,
                cue_start_secs, cue_end_secs, artwork_path, last_modified, indexed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
                params![
                    track.file_path,
                    track.title,
                    track.artist,
                    track.album,
                    track.album_artist,
                    track.track_number,
                    track.disc_number,
                    track.year,
                    track.genre,
                    track.duration_secs,
                    track.format.to_string(),
                    track.bit_depth,
                    track.sample_rate,
                    track.channels,
                    track.file_size_bytes,
                    track.cue_file_path,
                    track.cue_start_secs,
                    track.cue_end_secs,
                    track.artwork_path,
                    track.last_modified,
                    track.indexed_at
                ],
            )
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        Ok(self.conn.last_insert_rowid())
    }

    /// Get a track by ID
    pub fn get_track(&self, id: i64) -> Result<Option<LocalTrack>, LibraryError> {
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM local_tracks WHERE id = ?")
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        stmt.query_row(params![id], |row| Self::row_to_track(row))
            .optional()
            .map_err(|e| LibraryError::Database(e.to_string()))
    }

    /// Get a track by file path (for non-CUE tracks)
    pub fn get_track_by_path(&self, path: &str) -> Result<Option<LocalTrack>, LibraryError> {
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM local_tracks WHERE file_path = ? AND cue_file_path IS NULL")
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        stmt.query_row(params![path], |row| Self::row_to_track(row))
            .optional()
            .map_err(|e| LibraryError::Database(e.to_string()))
    }

    /// Delete all tracks in a folder
    pub fn delete_tracks_in_folder(&self, folder: &str) -> Result<usize, LibraryError> {
        let pattern = format!("{}%", folder);
        let count = self
            .conn
            .execute(
                "DELETE FROM local_tracks WHERE file_path LIKE ?",
                params![pattern],
            )
            .map_err(|e| LibraryError::Database(e.to_string()))?;
        Ok(count)
    }

    /// Clear all tracks
    pub fn clear_all_tracks(&self) -> Result<(), LibraryError> {
        self.conn
            .execute("DELETE FROM local_tracks", [])
            .map_err(|e| LibraryError::Database(e.to_string()))?;
        Ok(())
    }

    // === Query Methods ===

    /// Get all albums (paginated)
    pub fn get_albums(&self, limit: u32, offset: u32) -> Result<Vec<LocalAlbum>, LibraryError> {
        let mut stmt = self
            .conn
            .prepare(
                r#"
            SELECT
                album,
                COALESCE(album_artist, artist) as artist,
                MIN(year) as year,
                MAX(artwork_path) as artwork,
                COUNT(*) as track_count,
                SUM(duration_secs) as total_duration,
                MAX(format) as format,
                MIN(file_path) as directory_path
            FROM local_tracks
            GROUP BY album, COALESCE(album_artist, artist)
            ORDER BY artist, album
            LIMIT ? OFFSET ?
        "#,
            )
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(params![limit, offset], |row| {
                let album: String = row.get(0)?;
                let artist: String = row.get(1)?;
                Ok(LocalAlbum {
                    id: format!("{}_{}", artist, album),
                    title: album,
                    artist,
                    year: row.get(2)?,
                    artwork_path: row.get(3)?,
                    track_count: row.get(4)?,
                    total_duration_secs: row.get(5)?,
                    format: Self::parse_format(&row.get::<_, Option<String>>(6)?.unwrap_or_default()),
                    directory_path: row.get::<_, String>(7).unwrap_or_default(),
                })
            })
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        let mut albums = Vec::new();
        for album in rows {
            albums.push(album.map_err(|e| LibraryError::Database(e.to_string()))?);
        }
        Ok(albums)
    }

    /// Get tracks for an album
    pub fn get_album_tracks(
        &self,
        album: &str,
        artist: &str,
    ) -> Result<Vec<LocalTrack>, LibraryError> {
        let mut stmt = self
            .conn
            .prepare(
                r#"
            SELECT * FROM local_tracks
            WHERE album = ? AND COALESCE(album_artist, artist) = ?
            ORDER BY disc_number, track_number, title
        "#,
            )
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(params![album, artist], |row| Self::row_to_track(row))
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        let mut tracks = Vec::new();
        for track in rows {
            tracks.push(track.map_err(|e| LibraryError::Database(e.to_string()))?);
        }
        Ok(tracks)
    }

    /// Get all artists
    pub fn get_artists(&self) -> Result<Vec<LocalArtist>, LibraryError> {
        let mut stmt = self
            .conn
            .prepare(
                r#"
            SELECT
                COALESCE(album_artist, artist) as name,
                COUNT(DISTINCT album) as album_count,
                COUNT(*) as track_count
            FROM local_tracks
            GROUP BY name
            ORDER BY name
        "#,
            )
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(LocalArtist {
                    name: row.get(0)?,
                    album_count: row.get(1)?,
                    track_count: row.get(2)?,
                })
            })
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        let mut artists = Vec::new();
        for artist in rows {
            artists.push(artist.map_err(|e| LibraryError::Database(e.to_string()))?);
        }
        Ok(artists)
    }

    /// Search tracks by title, artist, or album
    pub fn search(&self, query: &str, limit: u32) -> Result<Vec<LocalTrack>, LibraryError> {
        let pattern = format!("%{}%", query);
        let mut stmt = self
            .conn
            .prepare(
                r#"
            SELECT * FROM local_tracks
            WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?
            LIMIT ?
        "#,
            )
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(params![&pattern, &pattern, &pattern, limit], |row| {
                Self::row_to_track(row)
            })
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        let mut tracks = Vec::new();
        for track in rows {
            tracks.push(track.map_err(|e| LibraryError::Database(e.to_string()))?);
        }
        Ok(tracks)
    }

    /// Get library statistics
    pub fn get_stats(&self) -> Result<LibraryStats, LibraryError> {
        let mut stmt = self
            .conn
            .prepare(
                r#"
            SELECT
                COUNT(*) as track_count,
                COUNT(DISTINCT album || COALESCE(album_artist, artist)) as album_count,
                COUNT(DISTINCT COALESCE(album_artist, artist)) as artist_count,
                COALESCE(SUM(duration_secs), 0) as total_duration,
                COALESCE(SUM(file_size_bytes), 0) as total_size
            FROM local_tracks
        "#,
            )
            .map_err(|e| LibraryError::Database(e.to_string()))?;

        stmt.query_row([], |row| {
            Ok(LibraryStats {
                track_count: row.get(0)?,
                album_count: row.get(1)?,
                artist_count: row.get(2)?,
                total_duration_secs: row.get(3)?,
                total_size_bytes: row.get(4)?,
            })
        })
        .map_err(|e| LibraryError::Database(e.to_string()))
    }

    // === Helpers ===

    /// Convert a database row to LocalTrack
    fn row_to_track(row: &rusqlite::Row) -> rusqlite::Result<LocalTrack> {
        Ok(LocalTrack {
            id: row.get(0)?,
            file_path: row.get(1)?,
            title: row.get(2)?,
            artist: row.get(3)?,
            album: row.get(4)?,
            album_artist: row.get(5)?,
            track_number: row.get(6)?,
            disc_number: row.get(7)?,
            year: row.get(8)?,
            genre: row.get(9)?,
            duration_secs: row.get(10)?,
            format: Self::parse_format(&row.get::<_, String>(11)?),
            bit_depth: row.get(12)?,
            sample_rate: row.get(13)?,
            channels: row.get(14)?,
            file_size_bytes: row.get(15)?,
            cue_file_path: row.get(16)?,
            cue_start_secs: row.get(17)?,
            cue_end_secs: row.get(18)?,
            artwork_path: row.get(19)?,
            last_modified: row.get(20)?,
            indexed_at: row.get(21)?,
        })
    }

    /// Parse format string to AudioFormat
    fn parse_format(s: &str) -> AudioFormat {
        match s.to_uppercase().as_str() {
            "FLAC" => AudioFormat::Flac,
            "ALAC" => AudioFormat::Alac,
            "WAV" => AudioFormat::Wav,
            "AIFF" => AudioFormat::Aiff,
            "APE" => AudioFormat::Ape,
            _ => AudioFormat::Unknown,
        }
    }
}

/// Library statistics
#[derive(Debug, Clone, serde::Serialize)]
pub struct LibraryStats {
    pub track_count: u32,
    pub album_count: u32,
    pub artist_count: u32,
    pub total_duration_secs: u64,
    pub total_size_bytes: u64,
}
```

## Update mod.rs

```rust
pub mod database;
pub use database::{LibraryDatabase, LibraryStats};
```

## Commit

```bash
git add src-tauri/src/library/database.rs
git add src-tauri/src/library/mod.rs
git commit -m "feat(library): add SQLite database layer for persistence"
```

---

# TASK 5: Tauri Commands

## Goal
Expose library functionality to the frontend via Tauri commands.

## Create src-tauri/src/library/commands.rs

```rust
//! Tauri commands for local library

use std::path::Path;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

use crate::library::{
    cue_to_tracks, CueParser, LibraryDatabase, LibraryError, LibraryScanner, LibraryStats,
    LocalAlbum, LocalArtist, LocalTrack, MetadataExtractor, ScanError, ScanProgress, ScanStatus,
};

/// Library state shared across commands
pub struct LibraryState {
    pub db: Arc<Mutex<LibraryDatabase>>,
    pub scan_progress: Arc<Mutex<ScanProgress>>,
}

// === Folder Management ===

#[tauri::command]
pub async fn library_add_folder(
    path: String,
    state: State<'_, LibraryState>,
) -> Result<(), String> {
    log::info!("Command: library_add_folder {}", path);

    // Validate path exists and is a directory
    let path_ref = Path::new(&path);
    if !path_ref.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !path_ref.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let db = state.db.lock().await;
    db.add_folder(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn library_remove_folder(
    path: String,
    state: State<'_, LibraryState>,
) -> Result<(), String> {
    log::info!("Command: library_remove_folder {}", path);

    let db = state.db.lock().await;
    db.remove_folder(&path).map_err(|e| e.to_string())?;
    db.delete_tracks_in_folder(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn library_get_folders(state: State<'_, LibraryState>) -> Result<Vec<String>, String> {
    log::info!("Command: library_get_folders");

    let db = state.db.lock().await;
    db.get_folders().map_err(|e| e.to_string())
}

// === Scanning ===

#[tauri::command]
pub async fn library_scan(state: State<'_, LibraryState>) -> Result<(), String> {
    log::info!("Command: library_scan");

    // Get folders to scan
    let folders = {
        let db = state.db.lock().await;
        db.get_folders().map_err(|e| e.to_string())?
    };

    if folders.is_empty() {
        return Err("No library folders configured".to_string());
    }

    // Reset progress
    {
        let mut progress = state.scan_progress.lock().await;
        *progress = ScanProgress {
            status: ScanStatus::Scanning,
            total_files: 0,
            processed_files: 0,
            current_file: None,
            errors: Vec::new(),
        };
    }

    let scanner = LibraryScanner::new();
    let mut all_errors: Vec<ScanError> = Vec::new();

    for folder in &folders {
        log::info!("Scanning folder: {}", folder);

        // Scan for files
        let scan_result = match scanner.scan_directory(Path::new(folder)) {
            Ok(result) => result,
            Err(e) => {
                all_errors.push(ScanError {
                    file_path: folder.clone(),
                    error: e.to_string(),
                });
                continue;
            }
        };

        let total_files = scan_result.audio_files.len() + scan_result.cue_files.len();

        // Update total count
        {
            let mut progress = state.scan_progress.lock().await;
            progress.total_files += total_files as u32;
        }

        // Process CUE files first (they create multiple tracks from one file)
        for cue_path in &scan_result.cue_files {
            {
                let mut progress = state.scan_progress.lock().await;
                progress.current_file = Some(cue_path.to_string_lossy().to_string());
            }

            match process_cue_file(cue_path, &state).await {
                Ok(_) => {}
                Err(e) => {
                    all_errors.push(ScanError {
                        file_path: cue_path.to_string_lossy().to_string(),
                        error: e,
                    });
                }
            }

            {
                let mut progress = state.scan_progress.lock().await;
                progress.processed_files += 1;
            }
        }

        // Process regular audio files (skip if covered by CUE)
        let cue_audio_files: std::collections::HashSet<_> = scan_result
            .cue_files
            .iter()
            .filter_map(|p| {
                CueParser::parse(p)
                    .ok()
                    .map(|cue| cue.audio_file)
            })
            .collect();

        for audio_path in &scan_result.audio_files {
            // Skip if this file is referenced by a CUE sheet
            let path_str = audio_path.to_string_lossy().to_string();
            if cue_audio_files.contains(&path_str) {
                let mut progress = state.scan_progress.lock().await;
                progress.processed_files += 1;
                continue;
            }

            {
                let mut progress = state.scan_progress.lock().await;
                progress.current_file = Some(path_str.clone());
            }

            match MetadataExtractor::extract(audio_path) {
                Ok(track) => {
                    let db = state.db.lock().await;
                    if let Err(e) = db.insert_track(&track) {
                        all_errors.push(ScanError {
                            file_path: path_str,
                            error: e.to_string(),
                        });
                    }
                }
                Err(e) => {
                    all_errors.push(ScanError {
                        file_path: path_str,
                        error: e.to_string(),
                    });
                }
            }

            {
                let mut progress = state.scan_progress.lock().await;
                progress.processed_files += 1;
            }
        }
    }

    // Mark complete
    {
        let mut progress = state.scan_progress.lock().await;
        progress.status = if all_errors.is_empty() {
            ScanStatus::Complete
        } else {
            ScanStatus::Complete // Still complete, but with errors
        };
        progress.current_file = None;
        progress.errors = all_errors;
    }

    log::info!("Library scan complete");
    Ok(())
}

/// Process a CUE file and insert its tracks
async fn process_cue_file(cue_path: &Path, state: &State<'_, LibraryState>) -> Result<(), String> {
    let cue = CueParser::parse(cue_path).map_err(|e| e.to_string())?;

    // Get audio file properties
    let audio_path = Path::new(&cue.audio_file);
    if !audio_path.exists() {
        return Err(format!("Audio file not found: {}", cue.audio_file));
    }

    let properties = MetadataExtractor::extract_properties(audio_path).map_err(|e| e.to_string())?;
    let format = MetadataExtractor::detect_format(audio_path);

    // Convert CUE to tracks
    let tracks = cue_to_tracks(&cue, properties.duration_secs, format, &properties);

    // Insert tracks
    let db = state.db.lock().await;
    for track in tracks {
        db.insert_track(&track).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn library_get_scan_progress(
    state: State<'_, LibraryState>,
) -> Result<ScanProgress, String> {
    let progress = state.scan_progress.lock().await;
    Ok(progress.clone())
}

// === Queries ===

#[tauri::command]
pub async fn library_get_albums(
    limit: Option<u32>,
    offset: Option<u32>,
    state: State<'_, LibraryState>,
) -> Result<Vec<LocalAlbum>, String> {
    log::info!("Command: library_get_albums");

    let db = state.db.lock().await;
    db.get_albums(limit.unwrap_or(50), offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn library_get_album_tracks(
    album: String,
    artist: String,
    state: State<'_, LibraryState>,
) -> Result<Vec<LocalTrack>, String> {
    log::info!("Command: library_get_album_tracks {} - {}", artist, album);

    let db = state.db.lock().await;
    db.get_album_tracks(&album, &artist)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn library_get_artists(state: State<'_, LibraryState>) -> Result<Vec<LocalArtist>, String> {
    log::info!("Command: library_get_artists");

    let db = state.db.lock().await;
    db.get_artists().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn library_search(
    query: String,
    limit: Option<u32>,
    state: State<'_, LibraryState>,
) -> Result<Vec<LocalTrack>, String> {
    log::info!("Command: library_search \"{}\"", query);

    let db = state.db.lock().await;
    db.search(&query, limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn library_get_stats(state: State<'_, LibraryState>) -> Result<LibraryStats, String> {
    log::info!("Command: library_get_stats");

    let db = state.db.lock().await;
    db.get_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn library_clear(state: State<'_, LibraryState>) -> Result<(), String> {
    log::info!("Command: library_clear");

    let db = state.db.lock().await;
    db.clear_all_tracks().map_err(|e| e.to_string())
}

// === Playback ===

#[tauri::command]
pub async fn library_get_track(
    track_id: i64,
    state: State<'_, LibraryState>,
) -> Result<LocalTrack, String> {
    log::info!("Command: library_get_track {}", track_id);

    let db = state.db.lock().await;
    db.get_track(track_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Track not found".to_string())
}
```

## Update mod.rs (final version)

```rust
//! Local music library module
//!
//! Provides functionality for scanning, indexing, and playing local audio files.
//! This module is completely independent of the Qobuz streaming functionality.

pub mod commands;
pub mod cue_parser;
pub mod database;
pub mod errors;
pub mod metadata;
pub mod models;
pub mod scanner;

pub use commands::LibraryState;
pub use cue_parser::{cue_to_tracks, CueParser, CueSheet, CueTrack};
pub use database::{LibraryDatabase, LibraryStats};
pub use errors::LibraryError;
pub use metadata::MetadataExtractor;
pub use models::*;
pub use scanner::{LibraryScanner, ScanResult};

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Get library database path in app data directory
pub fn get_db_path() -> PathBuf {
    let data_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("qbz");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("library.db")
}

/// Initialize library state
pub fn init_library_state() -> Result<LibraryState, LibraryError> {
    let db_path = get_db_path();
    let db = LibraryDatabase::open(&db_path)?;

    Ok(LibraryState {
        db: Arc::new(Mutex::new(db)),
        scan_progress: Arc::new(Mutex::new(ScanProgress::default())),
    })
}
```

## Commit

```bash
git add src-tauri/src/library/
git commit -m "feat(library): add Tauri commands for library operations"
```

---

# INTEGRATION NOTES (FOR CLAUDE)

After completing all tasks, Claude will need to:

1. Add `library` module to `src-tauri/src/lib.rs`:
   ```rust
   pub mod library;
   ```

2. Add LibraryState to AppState or manage separately

3. Register commands in invoke_handler:
   ```rust
   library::commands::library_add_folder,
   library::commands::library_remove_folder,
   // etc.
   ```

4. Add `library_play_track` command that uses the existing Player

5. Create frontend components (LibraryView.svelte, etc.)

---

# CHECKLIST

- [ ] Task 1: Scanner module complete
- [ ] Task 2: Metadata extraction complete
- [ ] Task 3: CUE parser complete
- [ ] Task 4: Database layer complete
- [ ] Task 5: Tauri commands complete
- [ ] All tests pass
- [ ] cargo check passes
- [ ] All commits made with proper messages
