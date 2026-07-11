import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const port = 5199;
const apiPort = 8799;
const baseUrl = `http://127.0.0.1:${port}/`;
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;
const apiUrl = `${apiBaseUrl}/services`;
const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const desktopViewports = [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1280, 720],
];

function waitForServer(url, timeoutMs = 15_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // Server is still starting.
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }

      setTimeout(poll, 250);
    };

    poll();
  });
}

function stopProcess(child, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function postJson(path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to seed ${path}: ${await response.text()}`);
  }

  return response.json();
}

async function putJson(path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error(`Failed to seed ${path}: ${await response.text()}`);
  }

  return response.json();
}

async function seedLayoutFixture() {
  const { service: qbit } = await postJson("/services", {
    name: "qBittorrent",
    typeId: "qbittorrent",
    url: "http://192.0.2.20:8080",
  });
  const { service: jellyfin } = await postJson("/services", {
    typeId: "jellyfin",
    url: "http://192.0.2.20:8096",
  });
  const { service: nas } = await postJson("/services", {
    typeId: "nas",
    url: "http://192.0.2.20:5000",
  });

  await putJson("/widgets", {
    widgets: [
      {
        h: 2,
        id: "widget-qbittorrent",
        serviceId: qbit.id,
        templateId: "wide",
        title: "qBittorrent",
        url: qbit.url,
        w: 4,
        x: 0,
        y: 0,
      },
      {
        h: 4,
        id: "widget-home-focus",
        scopedCss: `[data-widget-id="widget-home-focus"] { --accent: #2f80d1; }`,
        subtitle: "Layout check fixture",
        templateId: "custom-card",
        title: "My Self-Hosted Hub",
        url: "https://hub.example.test",
        w: 6,
        x: 3,
        y: 1,
      },
      {
        h: 4,
        id: "widget-jellyfin-media",
        serviceId: jellyfin.id,
        templateId: "hero",
        title: "Jellyfin",
        url: jellyfin.url,
        w: 5,
        x: 0,
        y: 6,
      },
      {
        h: 3,
        id: "widget-nas-storage",
        serviceId: nas.id,
        templateId: "wide",
        title: "NAS Storage",
        url: nas.url,
        w: 4,
        x: 8,
        y: 7,
      },
      {
        h: 3,
        id: "widget-status",
        subtitle: "Layout check bottom row",
        templateId: "custom-card",
        title: "Status",
        w: 5,
        x: 4,
        y: 12,
      },
    ],
  });
}

const dataDir = await mkdtemp(join(tmpdir(), "oh-no-layout-"));
const apiServer = spawn(
  process.execPath,
  [
    "--no-warnings=ExperimentalWarning",
    "server/index.mjs",
    "--serve-static",
    "false",
    "--host",
    "127.0.0.1",
    "--port",
    String(apiPort),
    "--data-dir",
    dataDir,
  ],
  {
    stdio: "pipe",
  },
);
const viteServer = spawn(
  process.execPath,
  [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    env: {
      ...process.env,
      VITE_API_TARGET: `http://127.0.0.1:${apiPort}`,
    },
    stdio: "pipe",
  },
);
let browser;

try {
  await waitForServer(apiUrl);
  await seedLayoutFixture();
  await waitForServer(baseUrl);

  browser = await chromium.launch({ headless: true });
  const failures = [];

  for (const [width, height] of desktopViewports) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByText("My Self-Hosted Hub").waitFor();

    const result = await page.evaluate(() => {
      const launcher = document.querySelector(".launcher").getBoundingClientRect();
      const topbar = document.querySelector(".topbar").getBoundingClientRect();
      const canvas = document.querySelector(".widget-canvas");

      if (!canvas) {
        return {
          hasCanvas: false,
          launcherTop: Math.round(launcher.top),
        };
      }

      const canvasRect = canvas.getBoundingClientRect();
      const canvasBeforeScroll = {
        bottom: Math.round(canvasRect.bottom),
        clientHeight: Math.round(canvas.clientHeight),
        maskImage:
          getComputedStyle(canvas).maskImage ||
          getComputedStyle(canvas).getPropertyValue("-webkit-mask-image"),
        overflowY: getComputedStyle(canvas).overflowY,
        scrollHeight: Math.round(canvas.scrollHeight),
        top: Math.round(canvasRect.top),
      };

      canvas.scrollTop = canvas.scrollHeight;

      const scrolledCanvasRect = canvas.getBoundingClientRect();
      const widgets = [...document.querySelectorAll(".widget-renderer")].map((widget) => {
        const rect = widget.getBoundingClientRect();
        const title = widget.querySelector("strong")?.textContent?.trim() || "Widget";

        return {
          height: Math.round(rect.height),
          title,
        };
      });

      return {
        canvas: canvasBeforeScroll,
        hasCanvas: true,
        launcherTop: Math.round(launcher.top),
        scrolledCanvasBottom: Math.round(scrolledCanvasRect.bottom),
        topbarBottom: Math.round(topbar.bottom),
        widgets,
      };
    });

    if (!result.hasCanvas) {
      failures.push(`${width}x${height}: missing .widget-canvas`);
      await page.close();
      continue;
    }

    if (result.canvas.top < result.topbarBottom + 12) {
      failures.push(`${width}x${height}: canvas starts before the header clears`);
    }

    if (result.canvas.bottom > result.launcherTop - 8) {
      failures.push(
        `${width}x${height}: canvas bottom ${result.canvas.bottom}px overlaps Dock top ${result.launcherTop}px`,
      );
    }

    if (result.scrolledCanvasBottom > result.launcherTop - 8) {
      failures.push(`${width}x${height}: scrolled canvas overlaps Dock`);
    }

    if (result.canvas.scrollHeight <= result.canvas.clientHeight) {
      failures.push(
        `${width}x${height}: widget canvas is not scrollable (${result.canvas.scrollHeight}px <= ${result.canvas.clientHeight}px)`,
      );
    }

    if (!["auto", "scroll"].includes(result.canvas.overflowY)) {
      failures.push(`${width}x${height}: widget canvas does not clip with vertical scrolling`);
    }

    if (result.canvas.maskImage === "none") {
      failures.push(`${width}x${height}: widget canvas has no softened edge mask`);
    }

    for (const widget of result.widgets) {
      if (widget.height < 64) {
        failures.push(`${width}x${height}: ${widget.title} collapsed below 64px`);
      }
    }

    await page.getByRole("button", { name: /edit widgets/i }).click();
    await page.getByRole("toolbar", { name: /widget editing/i }).waitFor();
    if (await page.getByRole("complementary", { name: /widget inspector/i }).isVisible().catch(() => false)) {
      failures.push(`${width}x${height}: widget inspector appears before a widget is selected`);
    }

    const editCanvasResult = await page.evaluate(() => {
      const canvas = document.querySelector(".widget-canvas");
      const canvasRect = canvas?.getBoundingClientRect();

      return {
        canvasRight: Math.round(canvasRect?.right || 0),
        rightInset: Number.parseFloat(getComputedStyle(canvas).right),
        viewportRight: window.innerWidth,
      };
    });

    if (editCanvasResult.rightInset > 1) {
      failures.push(`${width}x${height}: edit canvas reserves ${editCanvasResult.rightInset}px for inspector`);
    }

    if (Math.abs(editCanvasResult.viewportRight - editCanvasResult.canvasRight) > 2) {
      failures.push(`${width}x${height}: edit canvas no longer reaches the desktop right edge`);
    }

    await page.getByRole("button", { name: /add widget/i }).click();
    await page.getByRole("dialog", { name: /add widget/i }).waitFor();
    await page.getByRole("tab", { name: /integrations/i }).click();

    const integrationPickerResult = await page.evaluate(() =>
      [...document.querySelectorAll(".integration-source-card")].map((card) => ({
        clientHeight: Math.round(card.clientHeight),
        clientWidth: Math.round(card.clientWidth),
        scrollHeight: Math.round(card.scrollHeight),
        scrollWidth: Math.round(card.scrollWidth),
        text: card.textContent.replace(/\s+/g, " ").trim(),
      })),
    );

    for (const card of integrationPickerResult) {
      if (card.scrollHeight > card.clientHeight + 1) {
        failures.push(
          `${width}x${height}: integration source card "${card.text}" content overflows vertically (${card.scrollHeight}px > ${card.clientHeight}px)`,
        );
      }

      if (card.scrollWidth > card.clientWidth + 1) {
        failures.push(
          `${width}x${height}: integration source card "${card.text}" content overflows horizontally (${card.scrollWidth}px > ${card.clientWidth}px)`,
        );
      }
    }

    await page.getByRole("button", { name: /close add widget/i }).click();
    await page.getByRole("dialog", { name: /add widget/i }).waitFor({ state: "detached" });

    await page.getByRole("button", { name: /select widget my self-hosted hub/i }).click();
    await page.getByRole("complementary", { name: /widget inspector/i }).waitFor();

    const editResult = await page.evaluate(() => {
      const canvas = document.querySelector(".widget-canvas").getBoundingClientRect();
      const inspector = document.querySelector(".widget-inspector").getBoundingClientRect();
      const launcher = document.querySelector(".launcher").getBoundingClientRect();
      const selectedWidget = document.querySelector(".widget-frame.is-selected");
      const inspectorOverlapsDock =
        inspector.left < launcher.right &&
        inspector.right > launcher.left &&
        inspector.top < launcher.bottom &&
        inspector.bottom > launcher.top;

      return {
        canvasBottom: Math.round(canvas.bottom),
        inspectorOverlaysCanvas: inspector.left < canvas.right && inspector.right <= canvas.right + 2,
        hasEditGrid: document.querySelector(".widget-canvas-grid")?.classList.contains("is-editing"),
        inspectorBottom: Math.round(inspector.bottom),
        inspectorOverlapsDock,
        launcherTop: Math.round(launcher.top),
        resizeHandles:
          selectedWidget?.closest(".react-grid-item")?.querySelectorAll(".react-resizable-handle").length || 0,
        toolbarVisible: Boolean(document.querySelector(".widget-edit-toolbar")),
      };
    });

    if (!editResult.toolbarVisible || !editResult.hasEditGrid) {
      failures.push(`${width}x${height}: edit mode did not show toolbar and grid`);
    }

    if (editResult.resizeHandles < 4) {
      failures.push(`${width}x${height}: selected widget does not show resize handles`);
    }

    if (editResult.canvasBottom > editResult.launcherTop - 8) {
      failures.push(`${width}x${height}: edit canvas overlaps Dock`);
    }

    if (!editResult.inspectorOverlaysCanvas) {
      failures.push(`${width}x${height}: inspector is not overlaying the desktop canvas`);
    }

    if (editResult.inspectorOverlapsDock) {
      failures.push(`${width}x${height}: inspector overlaps Dock`);
    }

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByText("My Self-Hosted Hub").waitFor();
    await page.getByRole("button", { name: /open services launchpad/i }).click();
    const launchpadResult = await page.evaluate(() => {
      const search = document.querySelector(".launchpad-search").getBoundingClientRect();
      const grid = document.querySelector(".service-grid").getBoundingClientRect();

      return {
        pageDots: document.querySelectorAll(".launchpad-pages span").length,
        searchToGridGap: Math.round(grid.top - search.bottom),
        serviceTileHeight: Math.round(document.querySelector(".service-tile").getBoundingClientRect().height),
      };
    });

    if (launchpadResult.searchToGridGap < 14) {
      failures.push(`${width}x${height}: Launchpad search and services grid are too close`);
    }

    if (launchpadResult.pageDots !== 1) {
      failures.push(`${width}x${height}: Launchpad shows ${launchpadResult.pageDots} page dots for one service page`);
    }

    if (launchpadResult.serviceTileHeight > 112) {
      failures.push(
        `${width}x${height}: Launchpad service cards are ${launchpadResult.serviceTileHeight}px tall after status removal`,
      );
    }

    await page.getByTestId("launchpad-overlay").click({ position: { x: 8, y: 8 } });
    if (await page.getByRole("dialog", { name: /launchpad/i }).isVisible().catch(() => false)) {
      failures.push(`${width}x${height}: Launchpad did not close when its desktop overlay was clicked`);
    }

    await page.getByRole("button", { name: /open services launchpad/i }).click();
    await page.getByRole("button", { name: /open qbittorrent actions/i }).click();
    await page.getByRole("button", { name: /^edit qbittorrent$/i }).click();
    await page.locator(".service-settings-dialog").waitFor();
    await page.getByRole("tab", { name: /enhanced/i }).click();

    const settingsResult = await page.evaluate(() => {
      const dialog = document.querySelector(".service-settings-dialog").getBoundingClientRect();
      const launcher = document.querySelector(".launcher").getBoundingClientRect();
      const registry = document.querySelector(".enhanced-registry-panel").getBoundingClientRect();
      const dialogOverlapsDock =
        dialog.left < launcher.right &&
        dialog.right > launcher.left &&
        dialog.top < launcher.bottom &&
        dialog.bottom > launcher.top;

      return {
        dialogBottom: Math.round(dialog.bottom),
        dialogOverlapsDock,
        launcherTop: Math.round(launcher.top),
        registryWidth: Math.round(registry.width),
      };
    });

    if (settingsResult.dialogOverlapsDock) {
      failures.push(
        `${width}x${height}: service settings dialog bottom ${settingsResult.dialogBottom}px overlaps Dock top ${settingsResult.launcherTop}px`,
      );
    }

    if (settingsResult.registryWidth < 280) {
      failures.push(`${width}x${height}: registry panel is too narrow`);
    }

    await page.close();
  }

  if (failures.length > 0) {
    throw new Error(`Widget layout failures:\n${failures.join("\n")}`);
  }
} finally {
  await browser?.close().catch(() => {});
  await Promise.all([stopProcess(viteServer), stopProcess(apiServer)]);
  await rm(dataDir, { force: true, recursive: true });
}
