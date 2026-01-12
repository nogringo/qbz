# AirPlay Implementation Status - Technical Brief

**Date**: 2025-01-12
**Project**: QBZ (Native Qobuz Client for Linux)
**Language**: Rust (Tauri backend) + TypeScript/Svelte (frontend)

---

## Executive Summary

AirPlay audio casting is **partially implemented**. Discovery and UI are complete, but the actual RAOP (Remote Audio Output Protocol) streaming is not implemented. The `load_media`, `play`, `pause`, `stop`, `set_volume` methods return `NotImplemented` errors.

---

## What We Have (Complete)

### 1. mDNS Discovery (`discovery.rs`)

Full discovery of AirPlay devices via both `_raop._tcp.local.` and `_airplay._tcp.local.` services.

```rust
// File: src-tauri/src/cast/airplay/discovery.rs

const SERVICE_RAOP: &str = "_raop._tcp.local.";
const SERVICE_AIRPLAY: &str = "_airplay._tcp.local.";

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredAirPlayDevice {
    pub id: String,
    pub name: String,
    pub model: String,
    pub ip: String,
    pub port: u16,
    pub service: String,          // "raop" or "airplay"
    pub requires_password: bool,
}
```

**Features**:
- Discovers devices on local network
- Extracts device metadata (name, model, IP, port)
- Detects password requirement via `pw` property
- Handles both IPv4 and IPv6 (prefers IPv4)
- Properly handles device removal events

### 2. Command Infrastructure (`commands.rs`)

All Tauri commands are defined and registered:

```rust
// Discovery commands (WORKING)
airplay_start_discovery
airplay_stop_discovery
airplay_get_devices

// Connection commands (WORKING - but connection is fake)
airplay_connect
airplay_disconnect
airplay_get_status

// Playback commands (STUBS - return NotImplemented)
airplay_load_media
airplay_play
airplay_pause
airplay_stop
airplay_set_volume
```

### 3. Frontend Integration

The frontend `CastPicker.svelte` already shows AirPlay as a tab and can:
- List discovered AirPlay devices
- Attempt to connect (succeeds but connection is fake)
- Show device count badge

```typescript
// File: src/lib/stores/castStore.ts
case 'airplay':
  await invoke('airplay_load_media', {
    metadata: {
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      artwork_url: metadata.artworkUrl,
      duration_secs: metadata.durationSecs
    }
  });
  await invoke('airplay_play');
  break;
```

---

## What's Missing (Blockers)

### The Core Problem: RAOP Protocol Implementation

The `AirPlayConnection` struct has stub methods that return errors:

```rust
// File: src-tauri/src/cast/airplay/device.rs

pub struct AirPlayConnection {
    device: DiscoveredAirPlayDevice,
    connected: bool,  // This is fake - just a flag
}

impl AirPlayConnection {
    pub fn load_media(&mut self, _metadata: AirPlayMetadata) -> Result<(), AirPlayError> {
        Err(AirPlayError::NotImplemented(
            "RAOP sender integration not implemented".to_string(),
        ))
    }

    pub fn play(&mut self) -> Result<(), AirPlayError> {
        Err(AirPlayError::NotImplemented(
            "RAOP sender integration not implemented".to_string(),
        ))
    }
    // ... same for pause, stop, set_volume
}
```

### RAOP Protocol Requirements

To stream audio to an AirPlay device, we need to implement:

1. **RTSP Session Establishment**
   - `OPTIONS` - Query supported methods
   - `ANNOUNCE` - Send SDP (Session Description Protocol) with codec info
   - `SETUP` - Negotiate transport (RTP ports)
   - `RECORD` - Start streaming
   - `SET_PARAMETER` - Volume control, progress updates
   - `TEARDOWN` - End session

2. **RSA Encryption**
   - AirPlay uses RSA to encrypt the AES key
   - The AES key is used to encrypt the audio stream
   - Apple's public key is well-known, but we need RSA implementation

3. **Audio Encoding**
   - ALAC (Apple Lossless Audio Codec) - preferred
   - Or raw PCM (s16le, 44100Hz, stereo)
   - Audio must be packetized into RTP frames

4. **RTP Streaming with Timing**
   - Audio packets sent via UDP
   - Timing synchronization required
   - Sequence numbers and timestamps

---

## Potential Solutions

### Option A: Use `rust-raop-player` as External Process

**Repo**: https://github.com/LinusU/rust-raop-player

**Problem**: It's a CLI tool, not a library. Would need to:
- Spawn as subprocess
- Pipe PCM audio to it
- Parse its output for status

```bash
# How it works as CLI:
ffmpeg -i input.flac -f s16le -ar 44100 -ac 2 - | raop_play <device_ip>
```

**Feasibility**: Medium. Hacky but could work. User would need to install `raop_play`.

### Option B: FFI to `libraop` (C Library)

**Repo**: https://github.com/philippe44/libraop

**Problem**: Requires:
- C build toolchain
- FFI bindings generation
- Memory management across FFI boundary

**Feasibility**: Hard. Significant effort to integrate.

### Option C: Port RAOP Protocol to Pure Rust

**References**:
- https://openairplay.github.io/airplay-spec/
- https://emanuelecozzi.net/docs/airplay2 (AirPlay 2 internals)

**Required crates**:
- `rsa` - RSA encryption
- `aes` - AES encryption
- `alac-encoder` (doesn't exist in Rust, would need to use C lib or implement)
- Custom RTSP client
- Custom RTP sender

**Feasibility**: Very Hard. Weeks of work.

### Option D: AirPlay 2 HTTP-based Approach

AirPlay 2 introduced some HTTP-based APIs, but these are primarily for:
- Device pairing
- Metadata exchange
- NOT for audio streaming (still uses RAOP)

**Feasibility**: Not applicable for audio.

---

## Existing Rust Ecosystem

| Crate | Type | Status | Notes |
|-------|------|--------|-------|
| `rust-raop-player` | CLI | Active | Not a library, CLI only |
| `airplay-rs` | Library | WIP | "Very WIP", incomplete |
| `airguitar` | Receiver | Experimental | Wrong direction (receiver, not sender) |
| `mdns-sd` | Discovery | Stable | Already using this |

---

## Recommended Path Forward

### Short Term (Hide Feature)
1. Hide AirPlay tab from `CastPicker.svelte` UI
2. Keep discovery code (it works)
3. Document as "Coming Soon"

### Medium Term (External Tool)
1. Detect if `raop_play` is installed on system
2. If available, use subprocess approach
3. Show AirPlay only if tool is detected

### Long Term (Native Implementation)
1. Create Rust bindings for `libraop`
2. Or wait for a mature Rust RAOP library
3. Or implement RAOP from scratch (significant undertaking)

---

## Files Reference

```
src-tauri/src/cast/airplay/
├── mod.rs          # Module exports
├── discovery.rs    # mDNS discovery (COMPLETE)
├── device.rs       # Connection & playback (STUBS)
├── commands.rs     # Tauri commands (COMPLETE structure)
└── errors.rs       # Error types (COMPLETE)

src/lib/stores/
└── castStore.ts    # Frontend cast state (has AirPlay case)

src/lib/components/
└── CastPicker.svelte  # UI with AirPlay tab (COMPLETE)
```

---

## Key Technical Constraints

1. **No Pure Rust RAOP Library Exists** - The main blocker
2. **ALAC Encoding** - No Rust ALAC encoder, would need C FFI
3. **RSA Key Exchange** - Doable with `rsa` crate
4. **Timing Sync** - Complex, requires precise UDP timing

---

## Questions for Research Agent

1. Is there a newer Rust RAOP/AirPlay library released in 2024-2025?
2. Has anyone created Rust bindings for `libraop`?
3. Is there a simpler AirPlay protocol variant that doesn't require ALAC?
4. Could we use WebRTC or another protocol as a bridge?
5. Are there any AirPlay proxy/relay services that accept HTTP input?

---

## Contact

This document is for internal use. The codebase is at:
`/home/blitzkriegfc/Personal/qbz-nix/`
