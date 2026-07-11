# Oh No Selfhosted

Local-first homelab dashboard packaged as an npm CLI.

## Requirements

- Node.js 22.5 or newer.
- npm 10 or newer.
- macOS or Linux for managed service installation.

## Local package installation

From the repository:

```bash
npm ci
npm run pack:check
npm run pack:local
npm install -g ./oh-no-selfhosted-0.1.0.tgz
oh-no-selfhosted install
```

Do not install the managed service through `npx`; its package directory is a temporary cache location.

The service binds to `127.0.0.1:8787` by default. Put it behind an authenticated TLS reverse proxy for remote access; do not expose it directly to the public internet.

```bash
oh-no-selfhosted status
oh-no-selfhosted restart
oh-no-selfhosted uninstall
oh-no-selfhosted start
```

`uninstall` keeps the data directory.

## External plugins

External server plugins are unsandboxed and disabled by default. To enable them for a reviewed, trusted registry:

```bash
oh-no-selfhosted start --allow-unsafe-plugins
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
```

Project governance, security policy, and licensing live at the repository root.

Oh No Selfhosted is licensed under the Apache License 2.0. A copy of the license is included in the package.
