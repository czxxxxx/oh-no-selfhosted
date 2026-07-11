# Oh No Selfhosted

Local-first homelab dashboard packaged as an npm CLI.

## Requirements

- Node.js 22.5 or newer.
- npm 10 or newer.
- macOS or Linux for managed service installation.

## Install from npm

```bash
npm install --global oh-no-selfhosted
oh-no-selfhosted setup
oh-no-selfhosted start
```

The npm command installs the CLI. `setup` writes and enables the complete managed-service definition without starting it immediately; this includes the host, port, data and log directories, label, package runtime path, and unsafe-plugin setting. Running `setup` again replaces the definition, and omitted options return to their defaults. Use `restart` after reconfiguring a running service, or `start` if it is stopped. Registration remains explicit so `npm install` by itself never changes system services, and does not depend on lifecycle scripts blocked by npm 12.

## Local package installation

For an unreleased checkout:

```bash
npm ci
npm run pack:check
npm run pack:local
npm install -g ./oh-no-selfhosted-0.1.2.tgz
oh-no-selfhosted setup
oh-no-selfhosted start
```

Do not install the managed service through `npx`; its package directory is a temporary cache location.

The service binds to `127.0.0.1:8787` by default. Put it behind an authenticated TLS reverse proxy for remote access; do not expose it directly to the public internet.

To allow access from a trusted local network:

```bash
oh-no-selfhosted setup --host 0.0.0.0 --port 8787
oh-no-selfhosted restart
```

Include every non-default setting you want to preserve when rerunning `setup`, such as `--data-dir`, `--label`, `--log-dir`, or `--allow-unsafe-plugins`. Other devices can then open `http://<host-lan-ip>:8787`. The application has no built-in user authentication, so keep direct port exposure limited to a trusted LAN.

```bash
oh-no-selfhosted setup
oh-no-selfhosted start
oh-no-selfhosted stop
oh-no-selfhosted status
oh-no-selfhosted restart
oh-no-selfhosted update
oh-no-selfhosted remove
```

`remove` stops the service, disables auto-start, removes its service definition, and uninstalls the global npm package. The data directory is kept. Do not use a direct global npm uninstall after running `setup`, because that leaves a stale service definition behind.

`update` installs `oh-no-selfhosted@latest` from npm. If a managed macOS or Linux service is running, it is restarted after the package upgrade. Use `oh-no-selfhosted update --no-restart` for a package-only update.

## External plugins

External server plugins are unsandboxed and disabled by default. To enable them for a reviewed, trusted registry:

```bash
oh-no-selfhosted setup --allow-unsafe-plugins
oh-no-selfhosted restart
```

See [docs/plugin-registry.md](docs/plugin-registry.md) for manifests, dependencies, migrations, React runtime props, and the complete example.

## Development checks

```bash
npm test
npm run build
npm run test:layout
npm run plugin:validate -- ./builtins
npm run plugin:validate -- ./examples/plugin-registry
npm run pack:check
npm run publish:check
```

Project governance, security policy, and licensing live at the repository root.

Oh No Selfhosted is licensed under the Apache License 2.0. A copy of the license is included in the package.
