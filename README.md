# QBZ-NIX

Native Qobuz client for Linux with Hi-Fi audio support.

## Why?

Browser-based players (Chromium, Firefox) have a hardcoded sample rate cap (~48kHz). Qobuz offers up to 192kHz Hi-Res content. QBZ-NIX bypasses this limitation with native audio playback.

## Features

### Core
- Native audio playback (no browser limitations)
- Search, browse albums, artists, tracks
- Playback queue management
- Quality selection with automatic fallback

### Audio
- Support for all Qobuz quality tiers (MP3, CD, Hi-Res, Ultra Hi-Res)
- Sample rate / bit depth display
- DAC passthrough mode for bit-perfect playback
- Multiple audio backends (PipeWire, ALSA, PulseAudio)

### Planned
- Playlist management (local + Qobuz sync)
- Favorites synchronization
- Equalizer
- Last.fm integration
- Lyrics display

## Tech Stack

- **Backend:** Rust + Tauri
- **Frontend:** Svelte + TypeScript
- **Audio:** cpal/rodio with ALSA direct support

## Development

### Prerequisites

- Rust (latest stable)
- Node.js 18+
- Linux with audio support (PipeWire or PulseAudio)

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
qbz-nix/
├── src/                  # Frontend (Svelte)
├── src-tauri/
│   └── src/
│       ├── api/          # Qobuz API client
│       ├── player/       # Audio playback
│       ├── queue/        # Queue management
│       ├── config/       # Settings persistence
│       └── commands/     # Tauri IPC commands
└── static/               # Static assets
```

## License

MIT
