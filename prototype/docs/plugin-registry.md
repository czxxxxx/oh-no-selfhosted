# Plugin registry v1

Oh No Selfhosted can install service types, service adapters, integrations, and standalone React widget packs from a registry at runtime. The built-in catalog is itself a standard local registry; GitHub registries use the same index, manifests, validators, package loaders, and runtime registration contracts. Installing or updating an external plugin does not require rebuilding or reinstalling the host app.

## One contract, multiple sources

`builtins/registry.json` is the host's automatically trusted local source. Its packages are generated under `builtins/packages/` and are intentionally portable: copy the complete `builtins/` directory into another repository and it remains a valid registry. Local files use `file:` transport while GitHub uses HTTP; after transport, package validation and installation are identical.

Generated built-in contributions declare their own IDs in `replaces`. This makes moving an unchanged built-in package from the local source to a trusted external source an explicit, supported source migration rather than an ID collision.

The host core is limited to the registry/installer, SDK, Canvas, Widget Frame, editor, layout, persistence, security checks, and runtime loaders. Business definitions for core cards, adapters, integrations, and their server modules live in registry packages.

## Repository layout

Put `registry.json` at the repository root. Each code contribution points to its own directory:

```text
registry.json
widgets/example.hello/
  manifest.json
  widgets.json
  frontend.jsx
  widget.css
integrations/example.status/
  manifest.json
  templates.json
  integration.mjs
adapters/example.service/
  manifest.json
  widgets.json
  adapter.mjs
```

The complete runnable example is in `examples/plugin-registry`. Validate it with:

```bash
npm run plugin:validate -- examples/plugin-registry
```

Create a new package with:

```bash
npm run plugin:scaffold -- widget com.example.clock ./plugins/com.example.clock
```

## Common contract

Every code manifest uses `apiVersion: "oh-no.dev/v1"`, a namespaced stable `id`, an exact semantic `version`, its `kind`, and a `minHostVersion`. `capabilities` documents use of React, network, filesystem/process, host navigation/refresh, and service or integration state. `requires` declares dependencies on other contribution IDs. Missing dependencies from the same registry are installed first. Circular dependencies, version mismatches, conflicting IDs, accidental downgrades, and removal of a plugin that is still required or in use are rejected.

Use top-level `files` for server-side modules or assets that are not the manifest's main entry/templates/definitions file. Frontend-relative imports are still discovered recursively through `frontend`.

Use `replaces` when intentionally taking ownership of an existing ID. Widget definitions can list old local IDs in `aliases`; installed widgets are migrated to the new template ID during an atomic update.

## React widget packs

A widget pack is first-class and does not need to pretend to be an integration. Its manifest references a definitions file and an optional `frontend`:

```json
{
  "apiVersion": "oh-no.dev/v1",
  "kind": "widget",
  "id": "com.example.clock",
  "name": "Clock pack",
  "version": "1.0.0",
  "description": "Clock widgets",
  "frontend": {
    "entry": "frontend.jsx",
    "files": ["frontend.jsx", "clock.css"],
    "dependencies": { "date-fns": "4.1.0" },
    "styleIsolation": "scoped"
  },
  "widgets": "widgets.json"
}
```

Top-level server `dependencies` and `frontend.dependencies` must use exact npm versions. They are installed into the plugin's private data directory before activation and Vite compilation. React and React DOM come from the host, so hooks work without loading a second React copy. Relative JavaScript, TypeScript, JSX, TSX, JSON, and CSS imports are discovered recursively; `frontend.files` is only needed for unreferenced assets. CSS is scoped under the plugin root by default and its stylesheet is reference-counted and removed when no mounted widget uses it. `styleIsolation: "global"` is an explicit escape hatch.

React components receive:

- `data`, `config`, `widget`, `template`, `service`, and `style`
- `mode` (`preview` or `live`) and `isPreview`
- `capabilities`, `onRefresh`, and `openUrl`

Preview callbacks are inert. Throwing or failing to load is contained by the host error boundary.

Widget packages normally use `registration: "plugin"` and receive namespaced template IDs. The host's core widget pack uses `registration: "native"`, which preserves declared template IDs and places those templates in the normal Services/Native flows. The field is part of the same portable manifest contract, not a separate built-in loader.

## Integrations and shared connections

An integration provides a server `readState(config, context)` function plus one or more widget templates. Credentials and endpoint configuration live in reusable Integration Connection instances. Widgets only store an instance ID; multiple widgets can share cached state and concurrent refreshes are coalesced. Connection secrets are not returned in widget or registry payloads.

## GitHub sources

The settings UI accepts a repository, a `tree`/`blob` URL, or a direct `registry.json` URL. A branch or tag can be pinned. For a bare repository, the host first tries `main` and then asks GitHub for the repository's default branch. A GitHub token enables private repository reads and is stored only in the local database. Duplicate canonical repository-and-ref sources are rejected.

## Reliability behavior

Downloads are path-checked and size-bounded. Manifests and layouts are validated before activation. Frontend dependencies and code compile in a staging directory. Filesystem activation, database registration, alias migration, update, and uninstall have rollback paths. One invalid local plugin is reported in Settings and does not hide other valid plugins.

Server and React plugin code is intentionally unsandboxed because this project is designed for local, trusted use.
