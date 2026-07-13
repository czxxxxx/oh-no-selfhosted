import { chmodSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { findAvailableWidgetPosition } from "../src/widgetLayout.js";
import { normalizeEnhancedWidgetBinding } from "./enhanced/widgetBinding.mjs";
import { loadServiceTypes } from "./serviceTypeRegistry.mjs";
import {
  mapEnhancedAdapterRow,
  mapEnhancedRegistrySourceRow,
  mapEnhancedStateRow,
  mapInstalledIntegrationRow,
  mapInstalledWidgetPluginRow,
  mapIntegrationInstanceRow,
  mapIntegrationStateRow,
  mapRow,
  mapServiceEnhancementRow,
  mapWidgetRow,
  toRow,
} from "./storageMappers.mjs";
import { normalizeWidgetInput, validateScopedCss } from "./widgetValidation.mjs";

const DEFAULT_NOW = () => new Date().toISOString();

export function createServiceStore({ dataDir, now = DEFAULT_NOW }) {
  mkdirSync(dataDir, { mode: 0o700, recursive: true });
  if (process.platform !== "win32") {
    chmodSync(dataDir, 0o700);
  }
  const getServiceTypes = () => loadServiceTypes(dataDir);

  const database = new DatabaseSync(join(dataDir, "oh-no-selfhosted.sqlite"));

  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      type_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      color TEXT NOT NULL,
      icon_kind TEXT NOT NULL,
      icon_key TEXT NOT NULL,
      icon_url TEXT,
      sort_order INTEGER NOT NULL,
      pinned_to_dock INTEGER NOT NULL DEFAULT 0,
      dock_sort_order INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS widgets (
      id TEXT PRIMARY KEY,
      service_id TEXT,
      enhancement_id TEXT,
      enhanced_widget_id TEXT,
      enhanced_renderer_json TEXT,
      integration_id TEXT,
      integration_instance_id TEXT,
      template_id TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      url TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      w INTEGER NOT NULL,
      h INTEGER NOT NULL,
      min_w INTEGER NOT NULL,
      min_h INTEGER NOT NULL,
      plugin_id TEXT,
      refresh_interval_seconds INTEGER,
      z_index INTEGER NOT NULL,
      style_json TEXT NOT NULL,
      scoped_css TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS enhanced_adapters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      source_id TEXT,
      source_type TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      installed_path TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      widgets_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS service_enhancements (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL UNIQUE,
      adapter_id TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      config_json TEXT NOT NULL,
      poll_interval_seconds INTEGER NOT NULL,
      last_test_status TEXT,
      last_test_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS enhanced_states (
      id TEXT PRIMARY KEY,
      service_enhancement_id TEXT NOT NULL UNIQUE,
      state_json TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS enhanced_registry_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      ref_name TEXT,
      auth_token TEXT,
      trusted INTEGER NOT NULL DEFAULT 0,
      index_json TEXT,
      last_sync_status TEXT,
      last_sync_message TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS installed_integrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      source_id TEXT,
      source_type TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      installed_path TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      templates_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS installed_widget_plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      source_id TEXT,
      source_type TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      installed_path TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      widgets_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS integration_instances (
      id TEXT PRIMARY KEY,
      integration_id TEXT NOT NULL,
      name TEXT NOT NULL,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS integration_states (
      instance_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      fetched_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  function ensureColumn(tableName, columnName, definition) {
    const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();

    if (!columns.some((column) => column.name === columnName)) {
      database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  ensureColumn("widgets", "enhancement_id", "TEXT");
  ensureColumn("widgets", "enhanced_widget_id", "TEXT");
  ensureColumn("widgets", "enhanced_renderer_json", "TEXT");
  ensureColumn("widgets", "integration_id", "TEXT");
  ensureColumn("widgets", "integration_instance_id", "TEXT");
  ensureColumn("widgets", "plugin_id", "TEXT");
  ensureColumn("widgets", "refresh_interval_seconds", "INTEGER");
  ensureColumn("services", "pinned_to_dock", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("services", "dock_sort_order", "INTEGER");
  ensureColumn("enhanced_registry_sources", "trusted", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("enhanced_registry_sources", "index_json", "TEXT");
  ensureColumn("enhanced_registry_sources", "ref_name", "TEXT");
  ensureColumn("enhanced_registry_sources", "auth_token", "TEXT");
  ensureColumn("enhanced_adapters", "source_id", "TEXT");

  database
    .prepare(`
      UPDATE services
      SET icon_kind = 'preset', icon_key = type_id, icon_url = NULL
      WHERE type_id IN ('qnap', 'snapdrop')
        AND icon_url IN ('/heimdall-icons/qnap.png', '/heimdall-icons/snapdrop.png')
    `)
    .run();

  const insert = database.prepare(`
    INSERT INTO services (
      id,
      type_id,
      name,
      description,
      category,
      url,
      status,
      color,
      icon_kind,
      icon_key,
      icon_url,
      sort_order,
      pinned_to_dock,
      dock_sort_order,
      created_at,
      updated_at
    ) VALUES (
      $id,
      $type_id,
      $name,
      $description,
      $category,
      $url,
      $status,
      $color,
      $icon_kind,
      $icon_key,
      $icon_url,
      $sort_order,
      $pinned_to_dock,
      $dock_sort_order,
      $created_at,
      $updated_at
    )
  `);

  function insertRow(row) {
    insert.run({
      $category: row.category,
      $color: row.color,
      $created_at: row.created_at,
      $description: row.description,
      $dock_sort_order: row.dock_sort_order,
      $icon_key: row.icon_key,
      $icon_kind: row.icon_kind,
      $icon_url: row.icon_url,
      $id: row.id,
      $name: row.name,
      $pinned_to_dock: row.pinned_to_dock,
      $sort_order: row.sort_order,
      $status: row.status,
      $type_id: row.type_id,
      $updated_at: row.updated_at,
      $url: row.url,
    });
  }

  const insertWidget = database.prepare(`
    INSERT INTO widgets (
      id,
      service_id,
      enhancement_id,
      enhanced_widget_id,
      enhanced_renderer_json,
      integration_id,
      integration_instance_id,
      template_id,
      title,
      subtitle,
      url,
      x,
      y,
      w,
      h,
      min_w,
      min_h,
      plugin_id,
      refresh_interval_seconds,
      z_index,
      style_json,
      scoped_css,
      created_at,
      updated_at
    ) VALUES (
      $id,
      $service_id,
      $enhancement_id,
      $enhanced_widget_id,
      $enhanced_renderer_json,
      $integration_id,
      $integration_instance_id,
      $template_id,
      $title,
      $subtitle,
      $url,
      $x,
      $y,
      $w,
      $h,
      $min_w,
      $min_h,
      $plugin_id,
      $refresh_interval_seconds,
      $z_index,
      $style_json,
      $scoped_css,
      $created_at,
      $updated_at
    )
  `);

  function insertWidgetRow(widget) {
    insertWidget.run({
      $created_at: widget.createdAt,
      $enhanced_renderer_json: widget.enhancedRenderer ? JSON.stringify(widget.enhancedRenderer) : null,
      $enhanced_widget_id: widget.enhancedWidgetId,
      $enhancement_id: widget.enhancementId,
      $h: widget.h,
      $id: widget.id,
      $integration_id: widget.integrationId,
      $integration_instance_id: widget.integrationInstanceId,
      $min_h: widget.minH,
      $min_w: widget.minW,
      $plugin_id: widget.pluginId,
      $refresh_interval_seconds: widget.refreshIntervalSeconds,
      $scoped_css: validateScopedCss(widget.id, widget.scopedCss),
      $service_id: widget.serviceId,
      $style_json: JSON.stringify(widget.style),
      $subtitle: widget.subtitle,
      $template_id: widget.templateId,
      $title: widget.title,
      $updated_at: widget.updatedAt,
      $url: widget.url,
      $w: widget.w,
      $x: widget.x,
      $y: widget.y,
      $z_index: widget.zIndex,
    });
  }

  function nextSortOrder() {
    const result = database.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM services").get();

    return Number(result.next_order);
  }

  function normalizeWidgetEnhancedBinding(widget) {
    return normalizeEnhancedWidgetBinding(widget, {
      getAdapterById: (adapterId) =>
        mapEnhancedAdapterRow(database.prepare("SELECT * FROM enhanced_adapters WHERE id = $id").get({ $id: adapterId })),
      getEnhancementById: (enhancementId) =>
        mapServiceEnhancementRow(
          database.prepare("SELECT * FROM service_enhancements WHERE id = $id").get({ $id: enhancementId }),
        ),
    });
  }

  return {
    close() {
      database.close();
    },
    transaction(callback) {
      database.exec("BEGIN IMMEDIATE");

      try {
        const result = callback();
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    migratePluginWidgetAliases({ kind, pluginId, templates = [] }) {
      const timestamp = now();
      let changes = 0;

      if (kind === "integration" || kind === "widget") {
        const scopeColumn = kind === "integration" ? "integration_id" : "plugin_id";

        for (const template of templates) {
          for (const alias of template.aliases || []) {
            const result = database
              .prepare(`
                UPDATE widgets
                SET template_id = $template_id,
                    updated_at = $updated_at
                WHERE ${scopeColumn} = $plugin_id
                  AND template_id = $alias
              `)
              .run({
                $alias: alias,
                $plugin_id: pluginId,
                $template_id: template.id,
                $updated_at: timestamp,
              });
            changes += result.changes;
          }
        }

        return changes;
      }

      if (kind === "service-adapter") {
        const enhancedWidgets = database
          .prepare(`
            SELECT widgets.id, widgets.service_id, widgets.enhanced_widget_id
            FROM widgets
            INNER JOIN service_enhancements
              ON service_enhancements.id = widgets.enhancement_id
            WHERE service_enhancements.adapter_id = $plugin_id
          `)
          .all({ $plugin_id: pluginId });

        for (const template of templates) {
          for (const alias of template.aliases || []) {
            for (const widget of enhancedWidgets.filter((candidate) => candidate.enhanced_widget_id === alias)) {
              const result = database
                .prepare(`
                  UPDATE widgets
                  SET enhanced_widget_id = $widget_id,
                      template_id = $template_id,
                      updated_at = $updated_at
                  WHERE id = $id
                `)
                .run({
                  $id: widget.id,
                  $template_id: `enhanced:${encodeURIComponent(widget.service_id)}:${encodeURIComponent(template.id)}`,
                  $updated_at: timestamp,
                  $widget_id: template.id,
                });
              changes += result.changes;
            }
          }
        }
      }

      return changes;
    },
    createService(service) {
      const row = toRow(service, nextSortOrder(), now(), getServiceTypes());
      insertRow(row);

      return mapRow(row);
    },
    updateService(id, input) {
      const existingRow = database.prepare("SELECT * FROM services WHERE id = $id").get({ $id: id });

      if (!existingRow) {
        throw new Error("Service not found");
      }

      const existing = mapRow(existingRow);
      const timestamp = now();
      const typeChanged = input.typeId && input.typeId !== existing.typeId;
      const hasExplicitIconInput =
        Object.hasOwn(input, "iconKey") || Object.hasOwn(input, "iconKind") || Object.hasOwn(input, "iconUrl");
      const nextInput = {
        ...existing,
        ...input,
        id,
      };

      if (typeChanged && !hasExplicitIconInput) {
        delete nextInput.category;
        delete nextInput.color;
        delete nextInput.iconKey;
        delete nextInput.iconKind;
        delete nextInput.iconUrl;
      }

      const row = toRow(
        nextInput,
        existing.sortOrder,
        timestamp,
        getServiceTypes(),
      );

      row.created_at = existing.createdAt;

      database
        .prepare(`
          UPDATE services
          SET type_id = $type_id,
              name = $name,
              description = $description,
              category = $category,
              url = $url,
              status = $status,
              color = $color,
              icon_kind = $icon_kind,
              icon_key = $icon_key,
              icon_url = $icon_url,
              pinned_to_dock = $pinned_to_dock,
              dock_sort_order = $dock_sort_order,
              sort_order = $sort_order,
              updated_at = $updated_at
          WHERE id = $id
        `)
        .run({
          $category: row.category,
          $color: row.color,
          $description: row.description,
          $dock_sort_order: row.dock_sort_order,
          $icon_key: row.icon_key,
          $icon_kind: row.icon_kind,
          $icon_url: row.icon_url,
          $id: id,
          $name: row.name,
          $pinned_to_dock: row.pinned_to_dock,
          $sort_order: row.sort_order,
          $status: row.status,
          $type_id: row.type_id,
          $updated_at: row.updated_at,
          $url: row.url,
        });

      database
        .prepare("UPDATE widgets SET url = $url, updated_at = $updated_at WHERE service_id = $service_id AND url = $old_url")
        .run({
          $old_url: existing.url,
          $service_id: id,
          $updated_at: timestamp,
          $url: row.url,
        });

      return mapRow(
        database.prepare("SELECT * FROM services WHERE id = $id").get({ $id: id }),
      );
    },
    listServices() {
      return database
        .prepare("SELECT * FROM services ORDER BY sort_order ASC, name ASC")
        .all()
        .map(mapRow);
    },
    updateDockOrder(serviceIds) {
      if (!Array.isArray(serviceIds)) {
        throw new Error("Dock service ids must be an array");
      }

      const uniqueServiceIds = [...new Set(serviceIds.map((serviceId) => String(serviceId || "").trim()))].filter(
        Boolean,
      );
      const find = database.prepare("SELECT id FROM services WHERE id = $id");
      const timestamp = now();

      database.exec("BEGIN");

      try {
        uniqueServiceIds.forEach((serviceId, index) => {
          if (!find.get({ $id: serviceId })) {
            throw new Error("Service not found");
          }

          database
            .prepare(`
              UPDATE services
              SET pinned_to_dock = 1,
                  dock_sort_order = $dock_sort_order,
                  updated_at = $updated_at
              WHERE id = $id
            `)
            .run({
              $dock_sort_order: index,
              $id: serviceId,
              $updated_at: timestamp,
            });
        });

        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

      return this.listServices();
    },
    deleteService(id) {
      const existing = database.prepare("SELECT * FROM services WHERE id = $id").get({ $id: id });

      if (!existing) {
        return false;
      }

      const enhancements = database
        .prepare("SELECT id FROM service_enhancements WHERE service_id = $service_id")
        .all({ $service_id: id });

      database.exec("BEGIN");

      try {
        for (const enhancement of enhancements) {
          database
            .prepare("DELETE FROM enhanced_states WHERE service_enhancement_id = $service_enhancement_id")
            .run({ $service_enhancement_id: enhancement.id });
          database
            .prepare("DELETE FROM widgets WHERE enhancement_id = $enhancement_id")
            .run({ $enhancement_id: enhancement.id });
        }

        database.prepare("DELETE FROM widgets WHERE service_id = $service_id").run({ $service_id: id });
        database.prepare("DELETE FROM service_enhancements WHERE service_id = $service_id").run({ $service_id: id });
        database.prepare("DELETE FROM services WHERE id = $id").run({ $id: id });
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

      return true;
    },
    listWidgets() {
      return database
        .prepare("SELECT * FROM widgets ORDER BY y ASC, x ASC, z_index ASC")
        .all()
        .map(mapWidgetRow);
    },
    listEnhancedAdapters() {
      return database
        .prepare("SELECT * FROM enhanced_adapters ORDER BY name ASC")
        .all()
        .map(mapEnhancedAdapterRow);
    },
    getEnhancedAdapter(adapterId) {
      return mapEnhancedAdapterRow(
        database.prepare("SELECT * FROM enhanced_adapters WHERE id = $id").get({ $id: adapterId }),
      );
    },
    deleteEnhancedAdapter(adapterId) {
      const enhancements = database
        .prepare("SELECT id FROM service_enhancements WHERE adapter_id = $adapter_id")
        .all({ $adapter_id: adapterId });

      database.exec("BEGIN");

      try {
        for (const enhancement of enhancements) {
          database
            .prepare("DELETE FROM enhanced_states WHERE service_enhancement_id = $service_enhancement_id")
            .run({ $service_enhancement_id: enhancement.id });
          database
            .prepare("DELETE FROM widgets WHERE enhancement_id = $enhancement_id")
            .run({ $enhancement_id: enhancement.id });
        }

        database.prepare("DELETE FROM service_enhancements WHERE adapter_id = $adapter_id").run({
          $adapter_id: adapterId,
        });
        const result = database.prepare("DELETE FROM enhanced_adapters WHERE id = $id").run({ $id: adapterId });
        database.exec("COMMIT");

        return result.changes > 0;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    upsertEnhancedAdapter(input) {
      const timestamp = now();
      const existing = database.prepare("SELECT * FROM enhanced_adapters WHERE id = $id").get({ $id: input.id });
      const row = {
        createdAt: existing?.created_at || timestamp,
        id: input.id,
        installedPath: input.installedPath,
        manifest: input.manifest,
        name: input.name,
        sourceId: input.sourceId || null,
        sourceRef: input.sourceRef,
        sourceType: input.sourceType,
        updatedAt: timestamp,
        version: input.version,
        widgets: input.widgets,
      };

      database
        .prepare(`
          INSERT INTO enhanced_adapters (
            id,
            name,
            version,
            source_id,
            source_type,
            source_ref,
            installed_path,
            manifest_json,
            widgets_json,
            created_at,
            updated_at
          ) VALUES (
            $id,
            $name,
            $version,
            $source_id,
            $source_type,
            $source_ref,
            $installed_path,
            $manifest_json,
            $widgets_json,
            $created_at,
            $updated_at
          )
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            version = excluded.version,
            source_id = excluded.source_id,
            source_type = excluded.source_type,
            source_ref = excluded.source_ref,
            installed_path = excluded.installed_path,
            manifest_json = excluded.manifest_json,
            widgets_json = excluded.widgets_json,
            updated_at = excluded.updated_at
        `)
        .run({
          $created_at: row.createdAt,
          $id: row.id,
          $installed_path: row.installedPath,
          $manifest_json: JSON.stringify(row.manifest),
          $name: row.name,
          $source_id: row.sourceId,
          $source_ref: row.sourceRef,
          $source_type: row.sourceType,
          $updated_at: row.updatedAt,
          $version: row.version,
          $widgets_json: JSON.stringify(row.widgets),
        });

      return row;
    },
    listEnhancedRegistrySources() {
      return database
        .prepare("SELECT * FROM enhanced_registry_sources ORDER BY created_at DESC")
        .all()
        .map(mapEnhancedRegistrySourceRow);
    },
    getEnhancedRegistrySource(id, { includeSecrets = true } = {}) {
      return mapEnhancedRegistrySourceRow(
        database.prepare("SELECT * FROM enhanced_registry_sources WHERE id = $id").get({ $id: id }),
        { includeSecrets },
      );
    },
    createEnhancedRegistrySource(input) {
      const timestamp = now();
      const source = {
        authToken: String(input.authToken || "").trim() || null,
        createdAt: timestamp,
        id: randomUUID(),
        lastSyncMessage: null,
        lastSyncStatus: null,
        lastSyncedAt: null,
        name: String(input.name || "Registry").trim(),
        ref: String(input.ref || "").trim() || null,
        registryIndex: null,
        trusted: Boolean(input.trusted),
        type: input.type,
        updatedAt: timestamp,
        url: String(input.url || "").trim(),
      };

      if (!source.url) {
        throw new Error("Registry source URL is required");
      }

      database
        .prepare(`
          INSERT INTO enhanced_registry_sources (
            id,
            name,
            type,
            url,
            ref_name,
            auth_token,
            trusted,
            index_json,
            last_sync_status,
            last_sync_message,
            last_synced_at,
            created_at,
            updated_at
          ) VALUES (
            $id,
            $name,
            $type,
            $url,
            $ref_name,
            $auth_token,
            $trusted,
            $index_json,
            $last_sync_status,
            $last_sync_message,
            $last_synced_at,
            $created_at,
            $updated_at
          )
        `)
        .run({
          $created_at: source.createdAt,
          $auth_token: source.authToken,
          $id: source.id,
          $index_json: null,
          $last_sync_message: source.lastSyncMessage,
          $last_sync_status: source.lastSyncStatus,
          $last_synced_at: source.lastSyncedAt,
          $name: source.name,
          $ref_name: source.ref,
          $trusted: source.trusted ? 1 : 0,
          $type: source.type,
          $updated_at: source.updatedAt,
          $url: source.url,
        });

      return source;
    },
    updateEnhancedRegistrySourceSync(id, patch) {
      const timestamp = now();

      database
        .prepare(`
          UPDATE enhanced_registry_sources
          SET last_sync_status = $last_sync_status,
              last_sync_message = $last_sync_message,
              index_json = COALESCE($index_json, index_json),
              last_synced_at = $last_synced_at,
              updated_at = $updated_at
          WHERE id = $id
        `)
        .run({
          $id: id,
          $index_json: patch.registryIndex ? JSON.stringify(patch.registryIndex) : null,
          $last_sync_message: patch.lastSyncMessage || null,
          $last_sync_status: patch.lastSyncStatus || null,
          $last_synced_at: timestamp,
          $updated_at: timestamp,
        });

      return database
        .prepare("SELECT * FROM enhanced_registry_sources WHERE id = $id")
        .all({ $id: id })
        .map(mapEnhancedRegistrySourceRow)[0];
    },
    deleteEnhancedRegistrySource(id) {
      const result = database.prepare("DELETE FROM enhanced_registry_sources WHERE id = $id").run({ $id: id });

      return result.changes > 0;
    },
    listInstalledIntegrations() {
      return database
        .prepare("SELECT * FROM installed_integrations ORDER BY name ASC")
        .all()
        .map(mapInstalledIntegrationRow);
    },
    getInstalledIntegration(integrationId) {
      return mapInstalledIntegrationRow(
        database.prepare("SELECT * FROM installed_integrations WHERE id = $id").get({ $id: integrationId }),
      );
    },
    listIntegrationInstances({ includeConfig = false, integrationId = null } = {}) {
      const rows = integrationId
        ? database
            .prepare("SELECT * FROM integration_instances WHERE integration_id = $integration_id ORDER BY name ASC")
            .all({ $integration_id: integrationId })
        : database.prepare("SELECT * FROM integration_instances ORDER BY integration_id ASC, name ASC").all();

      return rows.map((row) => mapIntegrationInstanceRow(row, { includeConfig }));
    },
    getIntegrationInstance(instanceId, { includeConfig = true } = {}) {
      return mapIntegrationInstanceRow(
        database.prepare("SELECT * FROM integration_instances WHERE id = $id").get({ $id: instanceId }),
        { includeConfig },
      );
    },
    createIntegrationInstance(input) {
      const timestamp = now();
      const row = {
        config: input.config && typeof input.config === "object" ? input.config : {},
        createdAt: timestamp,
        id: input.id || randomUUID(),
        integrationId: String(input.integrationId || "").trim(),
        name: String(input.name || "Integration connection").trim(),
        updatedAt: timestamp,
      };

      if (!row.integrationId) {
        throw new Error("Integration instance integrationId is required");
      }

      if (!row.name) {
        throw new Error("Integration instance name is required");
      }

      database
        .prepare(`
          INSERT INTO integration_instances (
            id, integration_id, name, config_json, created_at, updated_at
          ) VALUES (
            $id, $integration_id, $name, $config_json, $created_at, $updated_at
          )
        `)
        .run({
          $config_json: JSON.stringify(row.config),
          $created_at: row.createdAt,
          $id: row.id,
          $integration_id: row.integrationId,
          $name: row.name,
          $updated_at: row.updatedAt,
        });

      return row;
    },
    updateIntegrationInstance(instanceId, input) {
      const existing = this.getIntegrationInstance(instanceId);

      if (!existing) {
        throw new Error("Integration instance not found");
      }

      const row = {
        ...existing,
        config: input.config && typeof input.config === "object" ? input.config : existing.config,
        name: input.name === undefined ? existing.name : String(input.name || "").trim(),
        updatedAt: now(),
      };

      if (!row.name) {
        throw new Error("Integration instance name is required");
      }

      database
        .prepare(`
          UPDATE integration_instances
          SET name = $name,
              config_json = $config_json,
              updated_at = $updated_at
          WHERE id = $id
        `)
        .run({
          $config_json: JSON.stringify(row.config),
          $id: instanceId,
          $name: row.name,
          $updated_at: row.updatedAt,
        });

      return row;
    },
    deleteIntegrationInstance(instanceId) {
      if (
        database.prepare("SELECT id FROM widgets WHERE integration_instance_id = $id LIMIT 1").get({ $id: instanceId })
      ) {
        throw new Error("Integration instance is still used by an existing widget");
      }

      database.exec("BEGIN");

      try {
        database.prepare("DELETE FROM integration_states WHERE instance_id = $id").run({ $id: instanceId });
        const result = database.prepare("DELETE FROM integration_instances WHERE id = $id").run({ $id: instanceId });
        database.exec("COMMIT");
        return result.changes > 0;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    getIntegrationState(instanceId) {
      return mapIntegrationStateRow(
        database.prepare("SELECT * FROM integration_states WHERE instance_id = $id").get({ $id: instanceId }),
      );
    },
    saveIntegrationState(instanceId, input) {
      const timestamp = now();
      const fetchedAt = input.fetchedAt || timestamp;

      database
        .prepare(`
          INSERT INTO integration_states (
            instance_id, state_json, status, error_message, fetched_at, updated_at
          ) VALUES (
            $instance_id, $state_json, $status, $error_message, $fetched_at, $updated_at
          )
          ON CONFLICT(instance_id) DO UPDATE SET
            state_json = excluded.state_json,
            status = excluded.status,
            error_message = excluded.error_message,
            fetched_at = excluded.fetched_at,
            updated_at = excluded.updated_at
        `)
        .run({
          $error_message: input.errorMessage || null,
          $fetched_at: fetchedAt,
          $instance_id: instanceId,
          $state_json: JSON.stringify(input.state || {}),
          $status: input.status || "ok",
          $updated_at: timestamp,
        });

      return this.getIntegrationState(instanceId);
    },
    upsertInstalledIntegration(input) {
      const timestamp = now();
      const existing = database.prepare("SELECT * FROM installed_integrations WHERE id = $id").get({ $id: input.id });
      const row = {
        createdAt: existing?.created_at || timestamp,
        id: input.id,
        installedPath: input.installedPath,
        manifest: input.manifest,
        name: input.name,
        sourceId: input.sourceId || null,
        sourceRef: input.sourceRef,
        sourceType: input.sourceType,
        templates: input.templates,
        updatedAt: timestamp,
        version: input.version,
      };

      database
        .prepare(`
          INSERT INTO installed_integrations (
            id,
            name,
            version,
            source_id,
            source_type,
            source_ref,
            installed_path,
            manifest_json,
            templates_json,
            created_at,
            updated_at
          ) VALUES (
            $id,
            $name,
            $version,
            $source_id,
            $source_type,
            $source_ref,
            $installed_path,
            $manifest_json,
            $templates_json,
            $created_at,
            $updated_at
          )
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            version = excluded.version,
            source_id = excluded.source_id,
            source_type = excluded.source_type,
            source_ref = excluded.source_ref,
            installed_path = excluded.installed_path,
            manifest_json = excluded.manifest_json,
            templates_json = excluded.templates_json,
            updated_at = excluded.updated_at
        `)
        .run({
          $created_at: row.createdAt,
          $id: row.id,
          $installed_path: row.installedPath,
          $manifest_json: JSON.stringify(row.manifest),
          $name: row.name,
          $source_id: row.sourceId,
          $source_ref: row.sourceRef,
          $source_type: row.sourceType,
          $templates_json: JSON.stringify(row.templates),
          $updated_at: row.updatedAt,
          $version: row.version,
        });

      return row;
    },
    deleteInstalledIntegration(integrationId) {
      database.exec("BEGIN");

      try {
        const instances = database
          .prepare("SELECT id FROM integration_instances WHERE integration_id = $integration_id")
          .all({ $integration_id: integrationId });

        for (const instance of instances) {
          database.prepare("DELETE FROM integration_states WHERE instance_id = $id").run({ $id: instance.id });
        }

        database.prepare("DELETE FROM integration_instances WHERE integration_id = $integration_id").run({
          $integration_id: integrationId,
        });
        database.prepare("DELETE FROM widgets WHERE integration_id = $integration_id").run({
          $integration_id: integrationId,
        });
        const result = database.prepare("DELETE FROM installed_integrations WHERE id = $id").run({
          $id: integrationId,
        });
        database.exec("COMMIT");

        return result.changes > 0;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    listInstalledWidgetPlugins() {
      return database
        .prepare("SELECT * FROM installed_widget_plugins ORDER BY name ASC")
        .all()
        .map(mapInstalledWidgetPluginRow);
    },
    getInstalledWidgetPlugin(pluginId) {
      return mapInstalledWidgetPluginRow(
        database.prepare("SELECT * FROM installed_widget_plugins WHERE id = $id").get({ $id: pluginId }),
      );
    },
    upsertInstalledWidgetPlugin(input) {
      const timestamp = now();
      const existing = database.prepare("SELECT * FROM installed_widget_plugins WHERE id = $id").get({ $id: input.id });
      const row = {
        createdAt: existing?.created_at || timestamp,
        id: input.id,
        installedPath: input.installedPath,
        manifest: input.manifest,
        name: input.name,
        sourceId: input.sourceId || null,
        sourceRef: input.sourceRef,
        sourceType: input.sourceType,
        updatedAt: timestamp,
        version: input.version,
        widgets: input.widgets,
      };

      database
        .prepare(`
          INSERT INTO installed_widget_plugins (
            id,
            name,
            version,
            source_id,
            source_type,
            source_ref,
            installed_path,
            manifest_json,
            widgets_json,
            created_at,
            updated_at
          ) VALUES (
            $id,
            $name,
            $version,
            $source_id,
            $source_type,
            $source_ref,
            $installed_path,
            $manifest_json,
            $widgets_json,
            $created_at,
            $updated_at
          )
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            version = excluded.version,
            source_id = excluded.source_id,
            source_type = excluded.source_type,
            source_ref = excluded.source_ref,
            installed_path = excluded.installed_path,
            manifest_json = excluded.manifest_json,
            widgets_json = excluded.widgets_json,
            updated_at = excluded.updated_at
        `)
        .run({
          $created_at: row.createdAt,
          $id: row.id,
          $installed_path: row.installedPath,
          $manifest_json: JSON.stringify(row.manifest),
          $name: row.name,
          $source_id: row.sourceId,
          $source_ref: row.sourceRef,
          $source_type: row.sourceType,
          $updated_at: row.updatedAt,
          $version: row.version,
          $widgets_json: JSON.stringify(row.widgets),
        });

      return row;
    },
    deleteInstalledWidgetPlugin(pluginId) {
      database.exec("BEGIN");

      try {
        database.prepare("DELETE FROM widgets WHERE plugin_id = $plugin_id").run({ $plugin_id: pluginId });
        const result = database.prepare("DELETE FROM installed_widget_plugins WHERE id = $id").run({ $id: pluginId });
        database.exec("COMMIT");

        return result.changes > 0;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    listServiceEnhancements() {
      return database
        .prepare("SELECT * FROM service_enhancements ORDER BY updated_at ASC")
        .all()
        .map(mapServiceEnhancementRow);
    },
    getServiceEnhancementById(id) {
      return mapServiceEnhancementRow(
        database.prepare("SELECT * FROM service_enhancements WHERE id = $id").get({ $id: id }),
      );
    },
    getServiceEnhancement(serviceId) {
      return mapServiceEnhancementRow(
        database
          .prepare("SELECT * FROM service_enhancements WHERE service_id = $service_id")
          .get({ $service_id: serviceId }),
      );
    },
    saveServiceEnhancement(serviceId, input) {
      const timestamp = now();
      const existingRow = database
        .prepare("SELECT * FROM service_enhancements WHERE service_id = $service_id")
        .get({ $service_id: serviceId });
      const existing = mapServiceEnhancementRow(existingRow);
      const id = existing?.id || randomUUID();
      const pollIntervalSeconds = Number(input.config?.pollIntervalSeconds || input.pollIntervalSeconds || 5);

      database
        .prepare(`
          INSERT INTO service_enhancements (
            id,
            service_id,
            adapter_id,
            enabled,
            config_json,
            poll_interval_seconds,
            last_test_status,
            last_test_message,
            created_at,
            updated_at
          ) VALUES (
            $id,
            $service_id,
            $adapter_id,
            $enabled,
            $config_json,
            $poll_interval_seconds,
            $last_test_status,
            $last_test_message,
            $created_at,
            $updated_at
          )
          ON CONFLICT(service_id) DO UPDATE SET
            adapter_id = excluded.adapter_id,
            enabled = excluded.enabled,
            config_json = excluded.config_json,
            poll_interval_seconds = excluded.poll_interval_seconds,
            last_test_status = excluded.last_test_status,
            last_test_message = excluded.last_test_message,
            updated_at = excluded.updated_at
        `)
        .run({
          $adapter_id: input.adapterId,
          $config_json: JSON.stringify(input.config || {}),
          $created_at: existing?.createdAt || timestamp,
          $enabled: input.enabled ? 1 : 0,
          $id: id,
          $last_test_message: input.lastTestMessage || existing?.lastTestMessage || null,
          $last_test_status: input.lastTestStatus || existing?.lastTestStatus || null,
          $poll_interval_seconds: Number.isFinite(pollIntervalSeconds) ? pollIntervalSeconds : 5,
          $service_id: serviceId,
          $updated_at: timestamp,
        });

      return mapServiceEnhancementRow(
        database
          .prepare("SELECT * FROM service_enhancements WHERE service_id = $service_id")
          .get({ $service_id: serviceId }),
      );
    },
    saveEnhancedState(serviceEnhancementId, input) {
      const timestamp = now();
      const existing = database
        .prepare("SELECT * FROM enhanced_states WHERE service_enhancement_id = $service_enhancement_id")
        .get({ $service_enhancement_id: serviceEnhancementId });
      const id = existing?.id || randomUUID();

      database
        .prepare(`
          INSERT INTO enhanced_states (
            id,
            service_enhancement_id,
            state_json,
            status,
            error_message,
            fetched_at,
            created_at,
            updated_at
          ) VALUES (
            $id,
            $service_enhancement_id,
            $state_json,
            $status,
            $error_message,
            $fetched_at,
            $created_at,
            $updated_at
          )
          ON CONFLICT(service_enhancement_id) DO UPDATE SET
            state_json = excluded.state_json,
            status = excluded.status,
            error_message = excluded.error_message,
            fetched_at = excluded.fetched_at,
            updated_at = excluded.updated_at
        `)
        .run({
          $created_at: existing?.created_at || timestamp,
          $error_message: input.errorMessage || null,
          $fetched_at: timestamp,
          $id: id,
          $service_enhancement_id: serviceEnhancementId,
          $state_json: JSON.stringify(input.state || {}),
          $status: input.status,
          $updated_at: timestamp,
        });

      return mapEnhancedStateRow(
        database
          .prepare("SELECT * FROM enhanced_states WHERE service_enhancement_id = $service_enhancement_id")
          .get({ $service_enhancement_id: serviceEnhancementId }),
      );
    },
    getEnhancedState(serviceEnhancementId) {
      return mapEnhancedStateRow(
        database
          .prepare("SELECT * FROM enhanced_states WHERE service_enhancement_id = $service_enhancement_id")
          .get({ $service_enhancement_id: serviceEnhancementId }),
      );
    },
    createWidget(input, { template = null } = {}) {
      let widget = normalizeWidgetInput({ ...input, id: input.id || randomUUID() }, { now: now(), template });

      if (input.x == null || input.y == null) {
        widget = { ...widget, ...findAvailableWidgetPosition(this.listWidgets(), widget) };
      }

      widget = normalizeWidgetEnhancedBinding(widget);
      insertWidgetRow(widget);

      return widget;
    },
    updateWidget(id, input, { template = null } = {}) {
      const existingRow = database.prepare("SELECT * FROM widgets WHERE id = $id").get({ $id: id });

      if (!existingRow) {
        throw new Error("Widget not found");
      }

      const existing = mapWidgetRow(existingRow);
      const widget = normalizeWidgetEnhancedBinding(
        normalizeWidgetInput({ ...input, id }, { existing, now: now(), template }),
      );
      const scopedCss = validateScopedCss(id, widget.scopedCss);

      database
        .prepare(`
          UPDATE widgets
          SET service_id = $service_id,
              enhancement_id = $enhancement_id,
              enhanced_widget_id = $enhanced_widget_id,
              enhanced_renderer_json = $enhanced_renderer_json,
              integration_id = $integration_id,
              integration_instance_id = $integration_instance_id,
              template_id = $template_id,
              title = $title,
              subtitle = $subtitle,
              url = $url,
              x = $x,
              y = $y,
              w = $w,
              h = $h,
              min_w = $min_w,
              min_h = $min_h,
              plugin_id = $plugin_id,
              refresh_interval_seconds = $refresh_interval_seconds,
              z_index = $z_index,
              style_json = $style_json,
              scoped_css = $scoped_css,
              updated_at = $updated_at
          WHERE id = $id
        `)
        .run({
          $enhanced_renderer_json: widget.enhancedRenderer ? JSON.stringify(widget.enhancedRenderer) : null,
          $enhanced_widget_id: widget.enhancedWidgetId,
          $enhancement_id: widget.enhancementId,
          $h: widget.h,
          $id: id,
          $integration_id: widget.integrationId,
          $integration_instance_id: widget.integrationInstanceId,
          $min_h: widget.minH,
          $min_w: widget.minW,
          $plugin_id: widget.pluginId,
          $refresh_interval_seconds: widget.refreshIntervalSeconds,
          $scoped_css: scopedCss,
          $service_id: widget.serviceId,
          $style_json: JSON.stringify(widget.style),
          $subtitle: widget.subtitle,
          $template_id: widget.templateId,
          $title: widget.title,
          $updated_at: widget.updatedAt,
          $url: widget.url,
          $w: widget.w,
          $x: widget.x,
          $y: widget.y,
          $z_index: widget.zIndex,
        });

      return { ...widget, scopedCss };
    },
    replaceWidgets(inputs, { templates = [] } = {}) {
      if (!Array.isArray(inputs)) {
        throw new Error("Widgets must be an array");
      }

      const timestamp = now();
      const existingWidgets = new Map(this.listWidgets().map((widget) => [widget.id, widget]));
      const services = new Map(this.listServices().map((service) => [service.id, service]));
      const templatesById = new Map(templates.map((template) => [template.id, template]));
      const widgets = inputs.map((input, index) =>
        normalizeWidgetEnhancedBinding(
          normalizeWidgetInput(
            {
              ...input,
              id: input.id || randomUUID(),
              zIndex: input.zIndex ?? index + 1,
            },
            {
              existing: existingWidgets.get(input.id) || {},
              now: timestamp,
              service: input.serviceId ? services.get(input.serviceId) : null,
              template: templatesById.get(input.templateId || existingWidgets.get(input.id)?.templateId) || null,
            },
          ),
        ),
      );

      database.exec("BEGIN");

      try {
        database.prepare("DELETE FROM widgets").run();

        for (const widget of widgets) {
          insertWidgetRow(widget);
        }

        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

      return this.listWidgets();
    },
    deleteWidget(id) {
      const result = database.prepare("DELETE FROM widgets WHERE id = $id").run({ $id: id });

      return result.changes > 0;
    },
  };
}
