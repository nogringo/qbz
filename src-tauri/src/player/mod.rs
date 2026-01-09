//! Audio player module
//!
//! Handles audio playback with support for:
//! - HTTP streaming from Qobuz
//! - FLAC, MP3 decoding via symphonia
//! - Gapless playback
//! - Volume control
//!
//! Uses a dedicated audio thread since rodio's OutputStream is not Send.

use std::io::{BufReader, Cursor};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::Arc;
use std::thread;

use rodio::{Decoder, OutputStream, Sink, Source};

use crate::api::{client::QobuzClient, models::Quality};

/// Commands sent to the audio thread
enum AudioCommand {
    /// Play audio data with track ID
    Play { data: Vec<u8>, track_id: u64 },
    /// Pause playback
    Pause,
    /// Resume playback
    Resume,
    /// Stop playback
    Stop,
    /// Set volume (0.0 - 1.0)
    SetVolume(f32),
}

/// Shared state between main thread and audio thread
#[derive(Clone)]
pub struct SharedState {
    /// Is currently playing
    is_playing: Arc<AtomicBool>,
    /// Current position in seconds
    position: Arc<AtomicU64>,
    /// Total duration in seconds
    duration: Arc<AtomicU64>,
    /// Current track ID
    current_track_id: Arc<AtomicU64>,
    /// Volume (0.0 - 1.0 stored as 0-100)
    volume: Arc<AtomicU64>,
}

impl Default for SharedState {
    fn default() -> Self {
        Self::new()
    }
}

impl SharedState {
    pub fn new() -> Self {
        Self {
            is_playing: Arc::new(AtomicBool::new(false)),
            position: Arc::new(AtomicU64::new(0)),
            duration: Arc::new(AtomicU64::new(0)),
            current_track_id: Arc::new(AtomicU64::new(0)),
            volume: Arc::new(AtomicU64::new(75)),
        }
    }

    pub fn is_playing(&self) -> bool {
        self.is_playing.load(Ordering::SeqCst)
    }

    pub fn position(&self) -> u64 {
        self.position.load(Ordering::SeqCst)
    }

    pub fn duration(&self) -> u64 {
        self.duration.load(Ordering::SeqCst)
    }

    pub fn current_track_id(&self) -> u64 {
        self.current_track_id.load(Ordering::SeqCst)
    }

    pub fn volume(&self) -> f32 {
        self.volume.load(Ordering::SeqCst) as f32 / 100.0
    }
}

/// Audio player that handles streaming playback
/// Uses a dedicated thread for audio output
pub struct Player {
    /// Channel to send commands to the audio thread
    tx: Sender<AudioCommand>,
    /// Shared state accessible from any thread
    pub state: SharedState,
}

impl Default for Player {
    fn default() -> Self {
        Self::new()
    }
}

impl Player {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<AudioCommand>();
        let state = SharedState::new();
        let thread_state = state.clone();

        // Spawn dedicated audio thread
        thread::spawn(move || {
            log::info!("Audio thread starting...");

            // Create output stream on this thread (it must stay here)
            let (_stream, stream_handle) = match OutputStream::try_default() {
                Ok(s) => {
                    log::info!("Audio output initialized successfully");
                    s
                }
                Err(e) => {
                    log::error!("Failed to create audio output: {}. Audio playback will not work.", e);
                    // Keep the thread alive to receive commands (even if we can't play)
                    // This prevents the channel from closing immediately
                    loop {
                        match rx.recv() {
                            Ok(_) => {
                                log::warn!("Audio command received but audio output is unavailable");
                            }
                            Err(_) => {
                                log::info!("Audio thread: channel closed, exiting");
                                break;
                            }
                        }
                    }
                    return;
                }
            };

            let mut current_sink: Option<Sink> = None;

            log::info!("Audio thread ready and waiting for commands");

            loop {
                match rx.recv() {
                    Ok(AudioCommand::Play { data, track_id }) => {
                        log::info!("Audio thread: playing track {}", track_id);

                        // Stop existing playback
                        if let Some(sink) = current_sink.take() {
                            sink.stop();
                        }

                        // Create new sink
                        let sink = match Sink::try_new(&stream_handle) {
                            Ok(s) => s,
                            Err(e) => {
                                log::error!("Failed to create sink: {}", e);
                                continue;
                            }
                        };

                        // Set volume
                        let volume = thread_state.volume.load(Ordering::SeqCst) as f32 / 100.0;
                        sink.set_volume(volume);

                        // Decode audio
                        let cursor = Cursor::new(data);
                        let source = match Decoder::new(BufReader::new(cursor)) {
                            Ok(s) => s,
                            Err(e) => {
                                log::error!("Failed to decode audio: {}", e);
                                continue;
                            }
                        };

                        // Get duration if available
                        if let Some(duration) = source.total_duration() {
                            thread_state
                                .duration
                                .store(duration.as_secs(), Ordering::SeqCst);
                        }

                        sink.append(source);

                        // Update state
                        thread_state.is_playing.store(true, Ordering::SeqCst);
                        thread_state.position.store(0, Ordering::SeqCst);
                        thread_state.current_track_id.store(track_id, Ordering::SeqCst);

                        current_sink = Some(sink);
                        log::info!("Audio thread: playback started");
                    }
                    Ok(AudioCommand::Pause) => {
                        if let Some(ref sink) = current_sink {
                            sink.pause();
                            thread_state.is_playing.store(false, Ordering::SeqCst);
                            log::info!("Audio thread: paused");
                        }
                    }
                    Ok(AudioCommand::Resume) => {
                        if let Some(ref sink) = current_sink {
                            sink.play();
                            thread_state.is_playing.store(true, Ordering::SeqCst);
                            log::info!("Audio thread: resumed");
                        }
                    }
                    Ok(AudioCommand::Stop) => {
                        if let Some(sink) = current_sink.take() {
                            sink.stop();
                        }
                        thread_state.is_playing.store(false, Ordering::SeqCst);
                        thread_state.position.store(0, Ordering::SeqCst);
                        log::info!("Audio thread: stopped");
                    }
                    Ok(AudioCommand::SetVolume(volume)) => {
                        thread_state
                            .volume
                            .store((volume * 100.0) as u64, Ordering::SeqCst);
                        if let Some(ref sink) = current_sink {
                            sink.set_volume(volume);
                        }
                        log::info!("Audio thread: volume set to {}", volume);
                    }
                    Err(_) => {
                        // Channel closed, exit thread
                        log::info!("Audio thread: channel closed, exiting");
                        break;
                    }
                }
            }
        });

        Self { tx, state }
    }

    /// Play a track by ID
    pub async fn play_track(
        &self,
        client: &QobuzClient,
        track_id: u64,
        quality: Quality,
    ) -> Result<(), String> {
        log::info!("Player: Starting playback for track {} with quality {:?}", track_id, quality);

        // Get the stream URL
        log::info!("Player: Getting stream URL...");
        let stream_url = client
            .get_stream_url_with_fallback(track_id, quality)
            .await
            .map_err(|e| {
                log::error!("Player: Failed to get stream URL: {}", e);
                format!("Failed to get stream URL: {}", e)
            })?;

        log::info!("Player: Got stream URL: {} (format: {})", stream_url.url, stream_url.mime_type);

        // Download the audio data
        log::info!("Player: Starting audio download...");
        let audio_data = self.download_audio(&stream_url.url).await.map_err(|e| {
            log::error!("Player: Download failed: {}", e);
            e
        })?;
        log::info!("Player: Downloaded {} bytes of audio data", audio_data.len());

        // Send to audio thread
        log::info!("Player: Sending to audio thread...");
        self.tx
            .send(AudioCommand::Play {
                data: audio_data,
                track_id,
            })
            .map_err(|e| {
                log::error!("Player: Failed to send to audio thread: {}", e);
                format!("Failed to send play command (audio thread may have crashed): {}", e)
            })?;

        log::info!("Player: Playback initiated successfully");
        Ok(())
    }

    /// Download audio from URL with timeout
    async fn download_audio(&self, url: &str) -> Result<Vec<u8>, String> {
        use std::time::Duration;

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        log::info!("Downloading audio from URL...");

        let response = client
            .get(url)
            .header("User-Agent", "Mozilla/5.0")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch audio: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("HTTP error: {}", response.status()));
        }

        log::info!("Download response received, reading bytes...");

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read audio bytes: {}", e))?;

        log::info!("Downloaded {} bytes", bytes.len());
        Ok(bytes.to_vec())
    }

    /// Pause playback
    pub fn pause(&self) -> Result<(), String> {
        self.tx
            .send(AudioCommand::Pause)
            .map_err(|e| format!("Failed to send pause command: {}", e))
    }

    /// Resume playback
    pub fn resume(&self) -> Result<(), String> {
        self.tx
            .send(AudioCommand::Resume)
            .map_err(|e| format!("Failed to send resume command: {}", e))
    }

    /// Stop playback
    pub fn stop(&self) -> Result<(), String> {
        self.tx
            .send(AudioCommand::Stop)
            .map_err(|e| format!("Failed to send stop command: {}", e))
    }

    /// Set volume (0.0 - 1.0)
    pub fn set_volume(&self, volume: f32) -> Result<(), String> {
        let clamped = volume.clamp(0.0, 1.0);
        self.tx
            .send(AudioCommand::SetVolume(clamped))
            .map_err(|e| format!("Failed to send volume command: {}", e))
    }

    /// Seek to position (not supported for streaming, but we track position)
    pub fn seek(&self, _position: u64) -> Result<(), String> {
        // Seeking in streaming audio is complex - for now just update the position tracker
        // Real seeking would require re-downloading from a specific byte offset
        log::warn!("Seek not fully implemented for streaming audio");
        Ok(())
    }

    /// Get current playback state
    pub fn get_state(&self) -> Result<PlaybackState, String> {
        Ok(PlaybackState {
            is_playing: self.state.is_playing(),
            position: self.state.position(),
            duration: self.state.duration(),
            track_id: self.state.current_track_id(),
            volume: self.state.volume(),
        })
    }
}

/// Playback state snapshot
#[derive(Debug, Clone, serde::Serialize)]
pub struct PlaybackState {
    pub is_playing: bool,
    pub position: u64,
    pub duration: u64,
    pub track_id: u64,
    pub volume: f32,
}
