# Casting/Streaming Research for QBZ

## Overview

This document outlines options for adding audio casting/streaming capabilities to QBZ, allowing users to stream music to external devices like Chromecast, DLNA receivers, AirPlay speakers, etc.

---

## 1. Chromecast (Google Cast)

### The Challenge
Google Cast protocol is proprietary and Google does not provide official SDKs for desktop Linux applications. The protocol uses:
- mDNS for device discovery
- CASTV2 protocol over TLS for control
- HTTP streaming for media delivery

### FOSS Options

#### rust-cast (RECOMMENDED)
- **Repo**: https://github.com/azasypkin/rust-cast
- **Crate**: https://crates.io/crates/rust-cast
- **Version**: 0.21.0 (as of Dec 2025)
- **Status**: **Actively maintained** - last commit Dec 30, 2025
- **Stars**: 150+ | **Contributors**: 11
- **Documentation**: 79.66% coverage on docs.rs
- **Features**:
  - Device discovery via mDNS/DNS-SD
  - Get device info, run/stop applications
  - Media streaming (video, audio, images)
  - Playback control (play, pause, seek, volume)
  - TLS via rustls, Protobuf serialization
- **Viability**: **Excellent** - Pure Rust, well-maintained, production-ready

#### pychromecast (Python) - Alternative
- **Repo**: https://github.com/home-assistant/pychromecast
- **Status**: Active (used by Home Assistant)
- **Notes**: Python library, would require FFI bridge or separate process
- **Viability**: Good but adds Python dependency

### Recommendation
**Now feasible with `rust-cast`**. The crate provides everything we need:
1. Add `rust-cast` to Cargo.toml
2. Implement device discovery UI
3. Stream audio via local HTTP server to Cast device
4. Control playback from QBZ

---

## 2. DLNA/UPnP (Digital Living Network Alliance)

### The Protocol
DLNA uses UPnP for device discovery and control. More open than Chromecast.

### FOSS Options

#### rupnp (Rust)
- **Repo**: https://github.com/jakobhellermann/rupnp
- **Status**: Active
- **Features**: UPnP device discovery and control
- **Viability**: Good foundation for DLNA support

#### gupnp (GLib/C)
- **Repo**: https://gitlab.gnome.org/GNOME/gupnp
- **Status**: Active, mature
- **Notes**: GNOME project, would need Rust bindings
- **Viability**: Solid but requires C FFI

#### miniupnpc (C)
- **Status**: Active, widely used
- **Notes**: Focused on port forwarding, less relevant for media

### Recommendation
**Easier than Chromecast**. `rupnp` provides a good Rust-native foundation. Would need to implement:
1. DLNA Media Renderer discovery
2. AVTransport service control
3. HTTP server for streaming audio to renderer

---

## 3. AirPlay (Apple)

### The Protocol
AirPlay 1 (audio) is somewhat documented. AirPlay 2 adds features but is more complex.

### FOSS Options

#### shairport-sync
- **Repo**: https://github.com/mikebrady/shairport-sync
- **Status**: Active, excellent
- **Notes**: AirPlay *receiver* (not sender) - opposite of what we need

#### uxplay
- **Repo**: https://github.com/FDH2/UxPlay
- **Status**: Active
- **Notes**: Also a receiver, not sender

#### raop-player (C)
- **Repo**: https://github.com/philippe44/raop-player
- **Status**: Active
- **Notes**: AirPlay sender! Can stream to AirPlay devices
- **Viability**: Best option - would need C FFI bindings

### Recommendation
**Medium difficulty**. `raop-player` is the only viable sender implementation. Would require:
1. C bindings via bindgen
2. Integration with QBZ audio pipeline
3. mDNS discovery for AirPlay devices

---

## 4. Bluetooth Audio (A2DP)

### The Protocol
A2DP (Advanced Audio Distribution Profile) is standard for Bluetooth audio streaming.

### FOSS Options

#### BlueZ + PipeWire/PulseAudio
- **Status**: Standard Linux audio stack
- **Notes**: Already handled at OS level
- **Viability**: Works out of the box if user pairs device

#### bluer (Rust)
- **Repo**: https://github.com/bluez/bluer
- **Status**: Active, official BlueZ Rust bindings
- **Notes**: Could use for device discovery/management UI

### Recommendation
**Easiest option**. Bluetooth audio "just works" through the Linux audio stack. QBZ could:
1. Add UI to show paired Bluetooth audio devices
2. Use `bluer` to list/connect devices
3. Audio routing handled by PipeWire/PulseAudio automatically

---

## 5. Snapcast (Multi-room Audio)

### The Protocol
Open source multi-room audio solution. Server-client architecture.

### FOSS Options

#### snapcast
- **Repo**: https://github.com/badaix/snapcast
- **Status**: Active
- **Notes**: C++ server/client, could integrate as audio sink

### Recommendation
**Niche but interesting**. Good for users with Snapcast setup. Could be added as an audio output option.

---

## Implementation Priority Recommendation

### Phase 1: Quick Wins
1. **Bluetooth UI** - Use `bluer` to show/manage Bluetooth audio devices
   - Effort: Low
   - Value: High (most users have Bluetooth speakers)

### Phase 2: Chromecast (NOW RECOMMENDED)
2. **Chromecast** - Use `rust-cast` crate (v0.21.0, actively maintained)
   - Effort: Medium
   - Value: High (very popular, great Rust support now available)
   - Crate: https://crates.io/crates/rust-cast

### Phase 3: DLNA Support
3. **DLNA/UPnP** - Use `rupnp` for device discovery and streaming
   - Effort: Medium
   - Value: High (many receivers, smart TVs support DLNA)

### Phase 4: AirPlay (if demand exists)
4. **AirPlay** - FFI bindings to `raop-player`
   - Effort: Medium-High
   - Value: Medium (Apple ecosystem users)

---

## Architecture Considerations

### Audio Pipeline Integration
Current QBZ audio flow:
```
Qobuz API → Download → Decode (symphonia) → Rodio Sink → System Audio
```

For casting, we'd need:
```
Qobuz API → Download → Decode → [Cast Protocol] → External Device
```

Options:
1. **Stream raw audio** - Send decoded PCM to cast device
2. **Stream URL** - Give cast device the Qobuz stream URL directly (may not work due to auth)
3. **Local HTTP server** - Transcode and serve via HTTP, give URL to cast device

### Recommended Architecture
```
                                    ┌─────────────────┐
                                    │  Local Speaker  │
                                    │   (Rodio)       │
                                    └────────▲────────┘
                                             │
┌──────────┐    ┌──────────┐    ┌───────────┴───────────┐
│  Qobuz   │───▶│  Decode  │───▶│   Audio Router        │
│   API    │    │(symphonia)│    │                       │
└──────────┘    └──────────┘    └───────────┬───────────┘
                                             │
                                    ┌────────▼────────┐
                                    │  HTTP Server    │
                                    │ (for casting)   │
                                    └────────┬────────┘
                                             │
                         ┌───────────────────┼───────────────────┐
                         │                   │                   │
                    ┌────▼────┐        ┌─────▼─────┐       ┌─────▼─────┐
                    │  DLNA   │        │Chromecast │       │  AirPlay  │
                    │Renderer │        │  Device   │       │  Speaker  │
                    └─────────┘        └───────────┘       └───────────┘
```

---

## Next Steps

1. [ ] Decide on priority order based on user needs
2. [ ] Prototype Bluetooth device UI with `bluer`
3. [ ] Evaluate `rupnp` for DLNA implementation
4. [ ] Research Chromecast protocol further if prioritized

---

## Resources

- [UPnP Device Architecture](http://upnp.org/specs/arch/UPnP-arch-DeviceArchitecture-v1.1.pdf)
- [DLNA Guidelines](https://spirespark.com/dlna/guidelines)
- [Chromecast Protocol Analysis](https://github.com/nicoulaj/rust-cast/wiki)
- [AirPlay Protocol Docs](https://nto.github.io/AirPlay.html)
- [bluer Rust crate](https://docs.rs/bluer/latest/bluer/)
- [rupnp Rust crate](https://docs.rs/rupnp/latest/rupnp/)
