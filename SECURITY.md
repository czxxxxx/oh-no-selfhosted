# Security Policy

## Supported versions

Until the first stable release, security fixes are applied to the latest revision of `main`. Older commits and locally modified plugin packages are not supported.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub Private Vulnerability Reporting at:

`https://github.com/czxxxxx/oh-no-selfhosted/security/advisories/new`

Include affected versions, reproduction steps, impact, and any suggested mitigation. Please allow a reasonable remediation window before public disclosure.

## Deployment boundary

- The server binds to `127.0.0.1` by default.
- The application does not provide built-in user authentication.
- Remote access must use an authenticated TLS reverse proxy or an equivalently protected private tunnel.
- Anyone who can reach the application must be treated as an administrator.
- The data directory contains service configuration and may contain credentials. Protect it as sensitive data.

## Plugins

External server plugins are disabled by default and intentionally unsandboxed. When enabled, an installed adapter or integration can access files, execute code, and make network requests with the dashboard process's permissions.

Only enable external plugins in an isolated environment after reviewing the complete source and dependency tree. Vulnerabilities in third-party plugins should also be reported to their maintainers.

## Security updates

Confirmed issues will be triaged, fixed on the supported branch, and documented in a GitHub Security Advisory or release notes when disclosure is appropriate.
