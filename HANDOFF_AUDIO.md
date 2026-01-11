# HANDOFF: Audio Output Device Selection Implementation

## Status: Backend Settings Complete, Player Modification Pending

### What's Done ✅

1. **Audio Settings Storage** (`src-tauri/src/config/audio_settings.rs`)
   - SQLite persistence for: `output_device`, `exclusive_mode`, `dac_passthrough`, `preferred_sample_rate`
   - Commands registered: `get_audio_settings`, `set_audio_output_device`, `set_audio_exclusive_mode`, `set_audio_dac_passthrough`, `set_audio_sample_rate`

2. **Device Listing** (`src-tauri/src/commands/playback.rs:295-328`)
   - `get_audio_devices()` - Lists available audio devices using rodio/cpal

### What's Pending ❌

#### 1. Modify Player to Use Selected Device

**File:** `src-tauri/src/player/mod.rs`

**Current code (line 175):**
```rust
let (_stream, stream_handle) = OutputStream::try_default();
```

**Needs to change to:**
```rust
use rodio::cpal::traits::{DeviceTrait, HostTrait};

// Get saved device preference
let settings = audio_settings_state.store.lock().unwrap().get_settings().unwrap_or_default();

let host = rodio::cpal::default_host();
let device = if let Some(device_name) = &settings.output_device {
    host.output_devices()
        .ok()
        .and_then(|mut devices| devices.find(|d| d.name().ok().as_ref() == Some(device_name)))
        .unwrap_or_else(|| host.default_output_device().expect("No output device"))
} else {
    host.default_output_device().expect("No output device")
};

let (_stream, stream_handle) = OutputStream::try_from_device(&device)
    .map_err(|e| format!("Failed to create output stream: {}", e))?;
```

#### 2. Pass AudioSettingsState to Player

**In `lib.rs`**, the Player is created in `AppState::new()` which doesn't have access to `audio_settings_state`. Options:

A. Create Player after audio_settings_state and pass it:
```rust
let audio_settings_state = config::audio_settings::AudioSettingsState::new()?;
let player = Player::new_with_settings(audio_settings_state.store.clone());
```

B. Or use a channel to send device change commands to the audio thread.

#### 3. Runtime Device Switching (Optional but Nice)

Add to `AudioCommand` enum:
```rust
enum AudioCommand {
    // ... existing
    SelectDevice(String),
}
```

Handle in audio thread to switch device without restart.

#### 4. Frontend Integration

**File:** `src/lib/components/views/SettingsView.svelte`

Currently the settings UI exists but doesn't save. Add:
```typescript
import { invoke } from '@tauri-apps/api/core';

// When outputDevice changes:
async function handleOutputDeviceChange(device: string) {
  outputDevice = device;
  await invoke('set_audio_output_device', {
    device: device === 'System Default' ? null : device
  });
}

// When exclusiveMode changes:
async function handleExclusiveModeChange(enabled: boolean) {
  exclusiveMode = enabled;
  await invoke('set_audio_exclusive_mode', { enabled });
}

// Similar for dacPassthrough
```

Also load settings on mount:
```typescript
async function loadAudioSettings() {
  const settings = await invoke<AudioSettings>('get_audio_settings');
  outputDevice = settings.output_device ?? 'System Default';
  exclusiveMode = settings.exclusive_mode;
  dacPassthrough = settings.dac_passthrough;
}
```

### Testing Checklist

1. [ ] Select specific device in Settings
2. [ ] Close and reopen app - device should persist
3. [ ] Play audio - should go to selected device
4. [ ] Toggle exclusive mode - verify behavior
5. [ ] Test with external DAC (when available Monday)

### Files to Modify

| File | Changes |
|------|---------|
| `src-tauri/src/player/mod.rs` | Use device from settings, modify Player::new() |
| `src-tauri/src/lib.rs` | Pass audio_settings to Player |
| `src/lib/components/views/SettingsView.svelte` | Wire up UI to backend commands |

### Dependencies

- rodio 0.19 supports `OutputStream::try_from_device()` ✅
- cpal traits already imported for device listing ✅

### Notes

- Exclusive mode on Linux requires ALSA configuration, not just app-side changes
- DAC passthrough may need specific sample rate matching
- User doesn't have DAC until Monday for testing
