//! ALSA audio backend (direct hardware access)
//!
//! Provides direct access to ALSA hardware devices for:
//! - True exclusive mode (blocks device for other apps)
//! - Bit-perfect playback (no resampling)
//! - Low-latency audio output
//!
//! Uses CPAL's ALSA host with specific device selection.

use super::backend::{AlsaPlugin, AudioBackend, AudioBackendType, AudioDevice, BackendConfig, BackendResult};
use rodio::{
    cpal::{
        traits::{DeviceTrait, HostTrait},
        BufferSize, SampleFormat, SampleRate, StreamConfig, SupportedBufferSize, SupportedStreamConfig,
    },
    OutputStream, OutputStreamHandle,
};
use std::process::Command;

pub struct AlsaBackend {
    host: rodio::cpal::Host,
}

impl AlsaBackend {
    pub fn new() -> BackendResult<Self> {
        // Try to get ALSA host
        let available_hosts = rodio::cpal::available_hosts();

        // Check if ALSA is available
        if !available_hosts.iter().any(|h| h.name() == "ALSA") {
            return Err("ALSA host not available on this system".to_string());
        }

        // Get ALSA host
        let host = rodio::cpal::host_from_id(
            available_hosts
                .into_iter()
                .find(|h| h.name() == "ALSA")
                .ok_or("ALSA host not found".to_string())?
        ).map_err(|e| format!("Failed to create ALSA host: {}", e))?;

        log::info!("[ALSA Backend] Initialized successfully");

        Ok(Self { host })
    }

    /// Enumerate ALSA devices using aplay -L, filtering only playback devices
    fn enumerate_alsa_devices(&self) -> BackendResult<Vec<AudioDevice>> {
        let mut devices = Vec::new();

        // Use aplay -L to get all ALSA device names
        let output = Command::new("aplay")
            .arg("-L")
            .output()
            .map_err(|e| format!("Failed to run aplay: {}", e))?;

        if !output.status.success() {
            return Err("aplay -L command failed".to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut current_device: Option<String> = None;
        let mut current_description: Option<String> = None;

        // Helper to check if device is valid for playback
        let is_valid_device = |id: &str| -> bool {
            // Only include actual hardware devices and useful virtual devices
            id == "default"
                || id == "pipewire"
                || id == "pulse"
                || id.starts_with("hw:")
                || id.starts_with("plughw:")
                || id.starts_with("sysdefault:CARD=")
                || id.starts_with("default:CARD=")
                || id.starts_with("front:CARD=")
                || id.starts_with("surround")
                || id.starts_with("hdmi:")
                || id.starts_with("iec958:")
        };

        for line in stdout.lines() {
            if line.is_empty() {
                // Empty line marks end of device entry
                if let (Some(id), Some(desc)) = (current_device.take(), current_description.take()) {
                    if is_valid_device(&id) {
                        let is_default = id == "default";
                        devices.push(AudioDevice {
                            id: id.clone(),
                            name: id,
                            description: Some(desc),
                            is_default,
                            max_sample_rate: None, // ALSA devices support variable sample rates
                        });
                    }
                }
                current_description = None;
            } else if !line.starts_with(' ') && !line.starts_with('\t') {
                // Device name (not indented)
                current_device = Some(line.trim().to_string());
            } else {
                // Description (indented)
                current_description = Some(line.trim().to_string());
            }
        }

        // Don't forget last device
        if let (Some(id), Some(desc)) = (current_device, current_description) {
            if is_valid_device(&id) {
                let is_default = id == "default";
                devices.push(AudioDevice {
                    id: id.clone(),
                    name: id,
                    description: Some(desc),
                    is_default,
                    max_sample_rate: None,
                });
            }
        }

        log::info!("[ALSA Backend] Enumerated {} devices via aplay -L (filtered)", devices.len());
        for (idx, dev) in devices.iter().enumerate() {
            log::info!("  [{}] {} - {}", idx, dev.name, dev.description.as_deref().unwrap_or(""));
        }

        Ok(devices)
    }
}

impl AudioBackend for AlsaBackend {
    fn backend_type(&self) -> AudioBackendType {
        AudioBackendType::Alsa
    }

    fn enumerate_devices(&self) -> BackendResult<Vec<AudioDevice>> {
        self.enumerate_alsa_devices()
    }

    fn create_output_stream(
        &self,
        config: &BackendConfig,
    ) -> BackendResult<(OutputStream, OutputStreamHandle)> {
        log::info!(
            "[ALSA Backend] Creating stream: {}Hz, {} channels, exclusive: {}, plugin: {:?}",
            config.sample_rate,
            config.channels,
            config.exclusive_mode,
            config.alsa_plugin
        );

        // Find the device by name/id
        let device = if let Some(device_id) = &config.device_id {
            log::info!("[ALSA Backend] Looking for device: {}", device_id);
            self.host
                .output_devices()
                .map_err(|e| format!("Failed to enumerate devices: {}", e))?
                .find(|d| {
                    d.name()
                        .ok()
                        .map(|n| n == *device_id)
                        .unwrap_or(false)
                })
                .ok_or_else(|| format!("Device '{}' not found", device_id))?
        } else {
            log::info!("[ALSA Backend] Using default device");
            self.host
                .default_output_device()
                .ok_or("No default ALSA device available")?
        };

        let device_name = device.name().unwrap_or_else(|_| "unknown".to_string());
        log::info!("[ALSA Backend] Using device: {}", device_name);

        // Create StreamConfig with requested sample rate
        let stream_config = StreamConfig {
            channels: config.channels,
            sample_rate: SampleRate(config.sample_rate),
            buffer_size: if config.exclusive_mode {
                // Smaller buffer for exclusive mode = lower latency
                BufferSize::Fixed(512)
            } else {
                BufferSize::Default
            },
        };

        // Check if device supports this configuration
        let supported_configs = device
            .supported_output_configs()
            .map_err(|e| format!("Failed to get supported configs: {}", e))?;

        let mut found_matching = false;
        for range in supported_configs {
            if range.channels() == config.channels
                && config.sample_rate >= range.min_sample_rate().0
                && config.sample_rate <= range.max_sample_rate().0
            {
                found_matching = true;
                log::info!(
                    "[ALSA Backend] Device supports {}Hz (range: {}-{}Hz)",
                    config.sample_rate,
                    range.min_sample_rate().0,
                    range.max_sample_rate().0
                );
                break;
            }
        }

        if !found_matching {
            log::warn!(
                "[ALSA Backend] Device may not support {}Hz, attempting anyway",
                config.sample_rate
            );
        }

        // Create SupportedStreamConfig
        let supported_config = SupportedStreamConfig::new(
            stream_config.channels,
            stream_config.sample_rate,
            SupportedBufferSize::Range { min: 64, max: 8192 },
            SampleFormat::F32,
        );

        // Create OutputStream with custom config
        let stream = OutputStream::try_from_device_config(&device, supported_config)
            .map_err(|e| {
                if config.exclusive_mode {
                    format!(
                        "Failed to create exclusive ALSA stream at {}Hz: {}. Device may be in use by another application.",
                        config.sample_rate, e
                    )
                } else {
                    format!("Failed to create ALSA stream at {}Hz: {}", config.sample_rate, e)
                }
            })?;

        log::info!(
            "[ALSA Backend] ✓ Output stream created successfully at {}Hz (exclusive: {})",
            config.sample_rate,
            config.exclusive_mode
        );

        Ok(stream)
    }

    fn is_available(&self) -> bool {
        // Check if we can enumerate devices (ALSA is working)
        self.host.output_devices().is_ok()
    }

    fn description(&self) -> &'static str {
        "ALSA Direct - Bit-perfect with optional exclusive hardware access"
    }
}
