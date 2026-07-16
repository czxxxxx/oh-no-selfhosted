# Changelog

Significant changes will be documented here until automated GitHub Releases become the canonical release record.

## Unreleased

## 0.1.4 - 2026-07-16

- Added Transmission as a built-in download service with its official mark and enhanced transfer, torrent, and queue widgets matching the qBittorrent experience.
- Added Transmission JSON-RPC 2.0 and legacy RPC support, including session-ID negotiation, optional Basic authentication, endpoint normalization, and live verification against Transmission 4.0.6.
- Restored bundled service-icon fallbacks and the QNAP and Snapdrop service marks.
- Added validated SVG service-icon uploads that rasterize safe SVGs and reject active or external content.

## 0.1.3 - 2026-07-12

- Fixed installed built-in service adapters being blocked after moving from a source checkout to the global npm package path.
- Restored Jellyfin, qBittorrent, QNAP, and Portainer widget refreshes without enabling external plugin execution.
- Added the current `allowUnsafePlugins` runtime status and safe CLI guidance to the dashboard Settings dialog.
- Added a demo dashboard screenshot to the GitHub and npm package READMEs.

## 0.1.2 - 2026-07-12

- Made `setup` configure auto-start without starting the service immediately.
- Changed `start`, `stop`, and `restart` to manage the background service exclusively.
- Removed the legacy `install` and service-only `uninstall` CLI commands.
- Kept `remove` as the safe one-command service cleanup and global package uninstall flow.

## 0.1.1 - 2026-07-12

- Added `oh-no-selfhosted update` for npm self-updates with safe managed-service restart behavior.
- Added clearer `setup` and one-command `remove` lifecycle commands while retaining the original aliases.
- Added token-free npm publishing through GitHub Actions OIDC.
- Added npm 12 install-script policy and package smoke-test compatibility.

## 0.1.0 - 2026-07-12

- Removed the bundled third-party application catalog and icon archive.
- Changed the default listen address to loopback.
- Disabled external unsandboxed plugins by default.
- Stopped returning stored adapter secrets through the API.
- Added package installation smoke testing and public repository governance files.
- Prepared the package for direct public npm installation with a publish dry-run gate.
