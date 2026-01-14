# Agent Instructions for QBZ

This file contains critical instructions for AI agents (Claude, Codex, Gemini, etc.) working on this codebase.

---

## Commit Signatures

When committing code, sign your commits with a short identifier at the end of the commit message:

| Agent | Signature |
|-------|-----------|
| Claude | `cc` |
| Codex | `cx` |
| Copilot | `cp` |
| Gemini | `gm` |

Example:
```
fix(ui): correct button alignment

cc
```

---

## CRITICAL: API Secrets in CI Workflows

**DO NOT REMOVE the API secrets from the GitHub Actions workflows.**

The following secrets MUST be passed to the build steps in `.github/workflows/release-linux.yml` and `.github/workflows/release-flatpak.yml`:

```yaml
env:
  SPOTIFY_API_CLIENT_ID: ${{ secrets.SPOTIFY_API_CLIENT_ID }}
  SPOTIFY_API_CLIENT_SECRET: ${{ secrets.SPOTIFY_API_CLIENT_SECRET }}
  TIDAL_API_CLIENT_ID: ${{ secrets.TIDAL_API_CLIENT_ID }}
  TIDAL_API_CLIENT_SECRET: ${{ secrets.TIDAL_API_CLIENT_SECRET }}
  DISCOGS_API_CLIENT_KEY: ${{ secrets.DISCOGS_API_CLIENT_KEY }}
  DISCOGS_API_CLIENT_SECRET: ${{ secrets.DISCOGS_API_CLIENT_SECRET }}
  LAST_FM_API_KEY: ${{ secrets.LAST_FM_API_KEY }}
  LAST_FM_API_SHARED_SECRET: ${{ secrets.LAST_FM_API_SHARED_SECRET }}
```

### Why This Matters

The Rust code uses `option_env!()` macro to embed these credentials at compile time. Without them:
- Last.fm scrobbling won't work
- Playlist import from Spotify/Tidal won't work
- Discogs integration won't work

### History

These secrets were accidentally removed when the `packaging-workflows` branch was merged (commit `13af897`), which overwrote the workflow files. They were re-added in commit `5dee9f3`.

### Verification

After any workflow changes, verify that:
1. The `Build DEB/RPM/AppImage` step in `release-linux.yml` has the `env:` block with all secrets
2. The `Build Flatpak` step in `release-flatpak.yml` has the `env:` block AND passes `--env-var` flags to `flatpak-builder`

---

## Local Development

For local development, create a `.env` file in the project root with the same variables. The `.env` file is gitignored.

---

## Other Critical Rules

See `CLAUDE.md` for additional instructions specific to Claude Code.
