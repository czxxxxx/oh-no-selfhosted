# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Current approved direction:

- Build an HTML self-hosted services navigation page, not a real macOS desktop clone.
- Do not include macOS menu bars, Apple branding, Finder, Trash, or OS status chrome.
- Keep a warm, quiet, glassy dashboard with desktop-like widgets over a scenic background.
- Launchpad is not a permanent main panel. It opens only after clicking the bottom `Services` launcher and overlays the dashboard widgets with a subtle scrim/blur.
- The bottom launcher stays visible while Launchpad is open, with `Services` shown as active.
- Desktop widgets live inside an independent scrollable canvas above the Dock. Widgets may extend below the first viewport and should be reached by scrolling the canvas, while the canvas itself always ends above the Dock.
- Dashboard backgrounds include user-uploaded images managed alongside built-in presets; uploaded files must persist in the server data directory and remain selectable and deletable from Settings.
- The widget canvas edges should feel feathered rather than hard-clipped, using a subtle top/bottom fade at desktop sizes.
- Service settings should only expose implemented tabs: Overview for name/type/URL/Dock pin, Enhanced for enhanced adapters, and Danger Zone for deleting a service.
- Enhanced adapter URL fields that mirror the service URL should be inherited from Overview rather than edited a second time.
- Widgets bound to a service should open that service by default; app-specific enhanced widget templates should appear only after the matching service is selected.
- Only base widgets are shared globally. Enhanced widgets must belong to their enhanced app package; each app declares and implements its own enhanced widgets instead of reusing common enhanced widget definitions.
- Add Widget should split service widgets into four clear steps: choose service, choose card type, configure, then preview.
- Native widgets are pure local widgets only. Anything that depends on a service, app adapter, or external API belongs under Services or Integrations instead of Native.
- Native Add Widget should not show a service/source selection step; it starts directly at card type, then configure, then preview.
- Extension points should converge on one GitHub Plugin Registry: a compatible repository may contribute service types, service-specific adapters, integrations, multiple host-rendered widgets, and locally compiled React widget frontends without reinstalling the host application.
- Remote adapter, integration, and React frontend code must require an explicitly trusted registry source, remain visibly labeled as unsandboxed code, and pass registration/build validation before installation.
- Built-in service types, native widget definitions, service adapters, and integrations must dogfood the same registration contracts and stay covered by the built-in registry self-check; canvas/editor/persistence/security and renderer implementations remain host core.
- Built-ins must be standard plugin packages from a local registry source, not a separate registration implementation. Local and GitHub sources must share package manifests, validation, installation, compilation, versioning, dependency, migration, and runtime registration behavior; local packages differ only by source transport, default trust, and automatic installation. A built-in package copied into a compatible external registry must remain installable without host-code changes.
