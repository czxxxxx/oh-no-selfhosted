# Oh No Selfhosted

A local-first dashboard for homelab services, widgets, integrations, and trusted extensions.

The project is pre-1.0. It is suitable for local evaluation and contribution, but configuration and plugin contracts may still change between releases.

## Highlights

- Responsive service launcher and widget canvas.
- Local SQLite persistence with no hosted control plane.
- Built-in adapters for common self-hosted services.
- User-managed backgrounds and service icons.
- A documented plugin registry and SDK for service types, widgets, adapters, and integrations.
- macOS LaunchAgent and Linux user-systemd installation through the npm CLI.

## Security model

The production server binds to `127.0.0.1` by default and does not include user authentication. Do not expose port `8787` directly to the public internet.

For access from another device, put the application behind a reverse proxy that provides TLS and authentication. Treat every user who can reach the application as an administrator: they can change services, widgets, and local configuration.

External server plugins execute with the same operating-system permissions as the dashboard. They are disabled by default. Enabling them requires the explicit `--allow-unsafe-plugins` option or `ALLOW_UNSAFE_PLUGINS=true`. Review the complete source of every plugin before installation.

See [SECURITY.md](SECURITY.md) for the threat model and vulnerability reporting process.

## Requirements

- Node.js 22.5 or newer; current Node 22 and 24 releases are tested in CI.
- npm 10 or newer.
- macOS or Linux for managed service installation. Other platforms can use foreground mode.

## Run from source

```bash
cd prototype
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`.

Production-style local run:

```bash
cd prototype
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:8787`.

## Install from npm

Published releases install and register the service with one Bash line:

```bash
npm install --global oh-no-selfhosted && oh-no-selfhosted install
```

The `&&` ensures service registration runs only after the versioned package installs successfully. Registration remains an explicit CLI action rather than a package `postinstall` side effect.

The managed service binds to loopback and stores persistent data outside the npm package. Avoid running the installer through `npx`: npm's temporary execution cache is not a stable service location.

Useful commands:

```bash
oh-no-selfhosted status
oh-no-selfhosted restart
oh-no-selfhosted uninstall
oh-no-selfhosted start
```

`uninstall` removes the service definition but keeps user data.

## Build and install a local package

For an unreleased checkout, verify and install the local tarball:

```bash
cd prototype
npm ci
npm run pack:check
npm run pack:local
npm install -g ./oh-no-selfhosted-0.1.0.tgz
oh-no-selfhosted install
```

## Configuration

| Option / environment variable | Default | Purpose |
|---|---:|---|
| `--host`, `HOST` | `127.0.0.1` | Listen address. Use a reverse proxy for remote access. |
| `--port`, `PORT` | `8787` | HTTP port. |
| `--data-dir`, `DATA_DIR` | platform data directory | SQLite database, installed plugins, uploads, and caches. |
| `STATIC_DIR` | package `dist/` | Built frontend directory. |
| `SERVE_STATIC` | `true` | Serve the frontend from the API process. |
| `ALLOW_UNSAFE_PLUGINS` | `false` | Allow unsandboxed external server plugins. |
| `INTEGRATION_PLUGIN_DIRS` | empty | Additional integration roots; used only when external plugins are enabled. |
| `WIDGET_PLUGIN_DIRS` | empty | Additional widget roots; used only when external plugins are enabled. |

The application does not automatically load `.env` files. Export variables in the shell or configure them in the process manager/reverse proxy.

## Data

Runtime data is ignored by Git. From a source checkout it defaults to `prototype/data/`; package installations use the platform application-data directory. The data directory is created with user-only permissions on macOS and Linux.

Service credentials and private registry tokens are sensitive. They are never returned by the public API, but are stored locally for adapters that need them. Back up and protect the data directory accordingly.

## Plugins

Built-in packages use the same manifest contracts as external packages. External server and React plugin code is intentionally unsandboxed and must be treated like software installed directly on the host.

See [the plugin registry guide](prototype/docs/plugin-registry.md) and the complete [example registry](prototype/examples/plugin-registry/).

## Verification

```bash
cd prototype
npm test
npm run build
npm run test:layout
npm run plugin:validate -- ./builtins
npm run plugin:validate -- ./examples/plugin-registry
npm run pack:check
npm run publish:check
```

## Repository layout

```text
prototype/
  bin/          CLI and service manager
  builtins/     generated built-in registry
  docs/         plugin contract documentation
  examples/     example plugin registry
  plugin-sdk/   JSON schemas
  scripts/      build and verification tools
  server/       local API, storage, and plugin runtimes
  src/          React application
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

Licensed under the [Apache License 2.0](LICENSE). Third-party notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
