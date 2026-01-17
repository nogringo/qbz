//! Audio backend system
//!
//! Provides abstraction over different audio backends (PipeWire, ALSA, PulseAudio)
//! allowing users to choose their preferred audio stack.

pub mod backend;
pub mod pipewire_backend;
pub mod alsa_backend;
pub mod pulse_backend;

// Re-export commonly used types
pub use backend::{
    AlsaPlugin,
    AudioBackend,
    AudioBackendType,
    AudioDevice,
    BackendConfig,
    BackendManager,
    BackendResult,
};
