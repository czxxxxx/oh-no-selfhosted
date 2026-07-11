# Changelog

Significant changes will be documented here until automated GitHub Releases become the canonical release record.

## Unreleased

## 0.1.1 - 2026-07-12

- Added `oh-no-selfhosted update` for npm self-updates with safe managed-service restart behavior.
- Added token-free npm publishing through GitHub Actions OIDC.
- Added npm 12 install-script policy and package smoke-test compatibility.

## 0.1.0 - 2026-07-12

- Removed the bundled third-party application catalog and icon archive.
- Changed the default listen address to loopback.
- Disabled external unsandboxed plugins by default.
- Stopped returning stored adapter secrets through the API.
- Added package installation smoke testing and public repository governance files.
- Prepared the package for direct public npm installation with a publish dry-run gate.
