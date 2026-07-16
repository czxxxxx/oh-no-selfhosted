// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import "../../../setupTests.js";
import { EnhancedWidgetRenderer } from "./EnhancedWidgetRenderer.jsx";

describe("EnhancedWidgetRenderer", () => {
  test("renders transfer speed as a production qBittorrent operations card", () => {
    const { container } = render(
      <EnhancedWidgetRenderer
        service={{ color: "#2f80d1", iconKey: "qbittorrent", iconKind: "preset", name: "qBittorrent" }}
        style={{ accentColor: "#2f80d1", backgroundOpacity: 0.76, radius: 20 }}
        template={{ name: "Transfer Speed" }}
        widget={{
          enhancedData: {
            activeTorrents: [
              {
                downloadedBytes: 2254857830,
                downloadSpeed: 8657043,
                etaSeconds: 720,
                name: "Planet.Earth.III.S01.2160p.WEB-DL.DDP5.1.HDR.H.265",
                progress: 48.8,
                ratio: 0.36,
                state: "downloading",
                status: "Downloading",
                totalBytes: 25984552141,
              },
              {
                downloadedBytes: 2147483648,
                name: "Ubuntu 24.04.1 Desktop amd64.iso",
                progress: 100,
                ratio: 2.35,
                state: "uploading",
                status: "Seeding",
                totalBytes: 2147483648,
                uploadSpeed: 1258291,
              },
              {
                downloadedBytes: 8459911168,
                name: "Dr.STONE.S04.2025.1080p.BluRay.x265.10bit.FLAC.2.0.2Audio-ADE",
                progress: 100,
                ratio: 0,
                state: "forcedUP",
                status: "Seeding",
                totalBytes: 8459911168,
                uploadSpeed: 0,
              },
              {
                downloadedBytes: 1750103360,
                name: "[石纪元 第四季].Dr.STONE.SCIENCE.FUTURE.2025.S04.Complete.1080p.friDay.WEB-DL.H264.AAC-UBWEB",
                progress: 100,
                ratio: 0.33,
                state: "forcedUP",
                status: "Seeding",
                totalBytes: 1748654179,
                uploadSpeed: 0,
              },
            ],
            downloadSpeed: 18.4 * 1024 * 1024,
            downloading: 2,
            peers: 24,
            seeding: 60,
            totalDownloaded: 1363394418442,
            totalUploaded: 304942678016,
            uploadSpeed: 2.1 * 1024 * 1024,
          },
          enhancedRenderer: {
            fields: [
              { format: "bytesPerSecond", key: "downloadSpeed", label: "Download" },
              { format: "bytesPerSecond", key: "uploadSpeed", label: "Upload" },
            ],
            renderer: "metric-pair",
          },
          enhancedWidgetId: "transfer-speed",
          title: "qBittorrent Transfer Speed",
        }}
      />,
    );

    const transferCard = container.querySelector(".qbittorrent-ops-card");

    expect(container.firstChild).toHaveClass("widget-renderer-enhanced-metric-pair");
    expect(transferCard).not.toBeNull();
    expect(transferCard).toHaveTextContent("Seeding");
    expect(transferCard).toHaveTextContent("60");
    expect(transferCard).toHaveTextContent("Downloading");
    expect(transferCard).toHaveTextContent("2");
    expect(transferCard).toHaveTextContent("Peers");
    expect(transferCard).toHaveTextContent("24");
    expect(transferCard).toHaveTextContent("Down Speed");
    expect(transferCard).toHaveTextContent("18.4 MB/s");
    expect(transferCard).toHaveTextContent("Up Speed");
    expect(transferCard).toHaveTextContent("2.1 MB/s");
    expect(transferCard).toHaveTextContent("Total Downloaded");
    expect(transferCard).toHaveTextContent("1.2 TB");
    expect(transferCard).toHaveTextContent("Planet.Earth.III");
    expect(transferCard).toHaveTextContent("Ubuntu 24.04.1");
    expect(transferCard).toHaveTextContent("Dr.STONE.S04");
    expect(transferCard).toHaveTextContent("石纪元 第四季");
    expect(screen.getByRole("meter", { name: /planet\.earth\.iii/i })).toHaveAttribute("aria-valuenow", "48.8");
  });

  test("labels idle qBittorrent rows as a seeding queue", () => {
    const { container } = render(
      <EnhancedWidgetRenderer
        service={{ color: "#2f80d1", iconKey: "qbittorrent", iconKind: "preset", name: "qBittorrent" }}
        style={{ accentColor: "#2f80d1", backgroundOpacity: 0.76, radius: 20 }}
        template={{ name: "Transfer Speed" }}
        widget={{
          enhancedData: {
            activeTorrents: [
              {
                downloadedBytes: 336852876,
                downloadSpeed: 0,
                name: "[莫离].The.First.Jasmine.2026.S01.Complete.1080p.WeTV.WEB-DL.H264.AAC-UBWEB",
                progress: 100,
                ratio: 1.57,
                state: "forcedUP",
                status: "Seeding",
                totalBytes: 335330854,
                uploadSpeed: 0,
              },
            ],
            downloadSpeed: 0,
            downloading: 0,
            peers: 4796,
            seeding: 60,
            totalDownloaded: 3849906475087,
            totalUploaded: 9071346839645,
            uploadSpeed: 0,
          },
          enhancedRenderer: { fields: [], renderer: "metric-pair" },
          enhancedWidgetId: "transfer-speed",
          title: "qBittorrent Transfer Speed",
        }}
      />,
    );

    const transferCard = container.querySelector(".qbittorrent-ops-card");

    expect(transferCard).toHaveTextContent("Seeding Queue");
    expect(transferCard).not.toHaveTextContent("Active Transfers");
    expect(transferCard).toHaveTextContent("3.5 TB");
    expect(transferCard).toHaveTextContent("8.3 TB");
  });

  test("renders Transmission with the shared torrent operations card", () => {
    const { container } = render(
      <EnhancedWidgetRenderer
        service={{
          color: "#d70014",
          iconKey: "transmission",
          iconKind: "preset",
          name: "Transmission",
          typeId: "transmission",
        }}
        style={{ accentColor: "#d70014", backgroundOpacity: 0.76, radius: 20 }}
        template={{ name: "Transfer Speed" }}
        widget={{
          enhancedData: {
            activeTorrents: [
              {
                downloadedBytes: 1073741824,
                downloadSpeed: 0,
                name: "Fedora-Workstation-Live-x86_64",
                progress: 41.5,
                ratio: 0.2,
                state: "queuedDownload",
                status: "Queued download",
                totalBytes: 2684354560,
                uploadSpeed: 0,
              },
            ],
            downloadSpeed: 0,
            downloading: 1,
            paused: 0,
            peers: 8,
            seeding: 0,
            totalDownloaded: 5368709120,
            totalUploaded: 1073741824,
            uploadSpeed: 0,
          },
          enhancedRenderer: {
            fields: [
              { format: "bytesPerSecond", key: "downloadSpeed", label: "Download" },
              { format: "bytesPerSecond", key: "uploadSpeed", label: "Upload" },
            ],
            renderer: "metric-pair",
          },
          enhancedWidgetId: "transfer-speed",
          title: "Transmission Transfer Speed",
        }}
      />,
    );

    expect(container.firstChild).toHaveClass("widget-renderer-enhanced-torrent-ops");
    expect(container.querySelector(".torrent-ops-card")).toHaveAccessibleName(
      "Transmission transfer and queue status",
    );
    expect(container.querySelector(".torrent-ops-card")).toHaveTextContent("Transfer Queue");
    expect(container.querySelector("[data-icon-key='transmission']")).not.toBeNull();
  });

  test("renders storage usage as a pie-only accessible donut chart", () => {
    render(
      <EnhancedWidgetRenderer
        service={{ color: "#c2410c", iconKey: "qnap", iconKind: "preset", name: "QNAP" }}
        style={{ accentColor: "#c2410c", backgroundOpacity: 0.76, radius: 20 }}
        template={{ name: "NAS Storage Summary" }}
        widget={{
          enhancedData: {
            totalBytes: 6171540360192,
            usedBytes: 2163407011840,
            usedPercent: 35.1,
          },
          enhancedRenderer: {
            renderer: "storage-donut",
          },
          title: "NAS Storage Summary",
        }}
      />,
    );

    const chart = screen.getByRole("img", { name: /storage usage 35\.1% used/i });

    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAccessibleName("Storage usage 35.1% used, 2.0 TB used, 3.6 TB free, 5.6 TB total");
    expect(chart).toHaveTextContent("35.1%");
    expect(chart).toHaveTextContent("Used");
    expect(chart).not.toHaveTextContent("Free");
    expect(chart).not.toHaveTextContent("Total");
    expect(chart.querySelector(".storage-donut-visual")).not.toBeNull();
    expect(chart.querySelector(".storage-donut-legend")).toBeNull();
    expect(chart).toHaveStyle("--storage-used-value: 35.1");
    expect(chart.querySelector(".storage-donut-ring")).not.toBeNull();
    expect(chart.querySelector(".storage-donut-progress")).toHaveAttribute("stroke-linecap", "round");
  });

  test("lets the storage donut scale with the widget card", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.enhanced-storage-donut\s*\{[^}]*container-type:\s*size;[^}]*place-items:\s*center;/s);
    expect(styles).toMatch(/\.storage-donut-visual\s*\{[^}]*width:\s*min\(82cqw,\s*82cqh\);/s);
  });

  test("renders Codex usage as accessible quota meters", () => {
    const { container } = render(
      <EnhancedWidgetRenderer
        service={null}
        style={{ accentColor: "#2f80d1", backgroundOpacity: 0.76, radius: 20 }}
        template={{
          integration: { color: "#10a37f", iconKey: "codex", iconKind: "preset", renderer: "codex-usage" },
          name: "Codex Usage",
        }}
        widget={{
          enhancedData: {
            available: true,
            refreshedAt: "2026-07-04T12:00:00.000Z",
            resetCreditSummary: { availableCount: 2, totalEarnedCount: 5 },
            resetCredits: [{ expiresAt: "2026-07-05T00:00:00.000Z", label: "Reset credit", status: "active" }],
            windows: [
              {
                code: "5h",
                label: "5 hour",
                limit: 100,
                percentRemaining: 68,
                percentUsed: 32,
                remaining: 68,
                resetAt: "2026-07-04T18:00:00.000Z",
                used: 32,
              },
              {
                code: "7d",
                label: "7 day",
                limit: 400,
                percentRemaining: 78.5,
                percentUsed: 21.5,
                remaining: 314,
                resetAt: "2026-07-08T00:00:00.000Z",
                used: 86,
              },
            ],
          },
          enhancedRenderer: {
            renderer: "codex-usage",
          },
          title: "Codex Usage",
        }}
      />,
    );

    expect(screen.getByRole("meter", { name: /5 hour codex remaining/i })).toHaveAttribute("aria-valuenow", "68");
    expect(screen.getByRole("meter", { name: /7 day codex remaining/i })).toHaveAttribute("aria-valuenow", "78.5");
    expect(screen.getByText("5h")).toBeInTheDocument();
    expect(screen.getByText("7d")).toBeInTheDocument();
    expect(screen.getByText("68%")).toBeInTheDocument();
    expect(screen.getByText("314 / 400 left")).toBeInTheDocument();
    expect(screen.getByText(/2 available/i)).toBeInTheDocument();
    expect(screen.getByText(/5 earned/i)).toBeInTheDocument();
    expect(screen.getByText(/reset credit/i)).toBeInTheDocument();
    expect(container.querySelector(".service-icon")).toHaveAttribute("data-icon-key", "codex");
  });

  test("renders Open-Meteo weather as an accessible integration card", () => {
    const { container } = render(
      <EnhancedWidgetRenderer
        service={null}
        style={{ accentColor: "#d97706", backgroundOpacity: 0.76, radius: 20 }}
        template={{
          integration: { color: "#d97706", iconKey: "weather", iconKind: "preset", renderer: "weather-current" },
          name: "Weather",
        }}
        widget={{
          enhancedData: {
            available: true,
            condition: "Overcast",
            feelsLike: 30.9,
            high: 30.2,
            humidity: 84,
            isDay: false,
            location: { label: "Shanghai, Shanghai Municipality, China", name: "Shanghai" },
            low: 24.2,
            temperature: 26.7,
            units: { temperature: "°C", windSpeed: "km/h" },
            windSpeed: 11.1,
          },
          enhancedRenderer: {
            renderer: "weather-current",
          },
          title: "Weather",
        }}
      />,
    );

    const summary = screen.getByRole("img", {
      name: /weather for shanghai, shanghai municipality, china: 26\.7 degrees celsius and overcast/i,
    });

    expect(container.firstChild).toHaveClass("widget-renderer-enhanced-weather-current");
    expect(screen.getByText("Shanghai")).toBeInTheDocument();
    expect(screen.getByText("26.7°")).toBeInTheDocument();
    expect(screen.getByText("Overcast")).toBeInTheDocument();
    expect(screen.getByText("Feels 30.9°")).toBeInTheDocument();
    expect(screen.getByText("24.2° / 30.2°")).toBeInTheDocument();
    expect(screen.getByText("84%")).toBeInTheDocument();
    expect(screen.getByText("11.1 km/h")).toBeInTheDocument();
    expect(summary).toBeInTheDocument();
  });

  test("renders an accessible empty state when weather has not been configured", () => {
    render(
      <EnhancedWidgetRenderer
        service={null}
        style={{ accentColor: "#d97706", backgroundOpacity: 0.76, radius: 20 }}
        template={{
          integration: { color: "#d97706", iconKey: "weather", iconKind: "preset", renderer: "weather-current" },
          name: "Weather",
        }}
        widget={{
          enhancedData: { available: false, errorMessage: "Set a weather location first." },
          enhancedRenderer: { renderer: "weather-current" },
          enhancedStateStatus: "missing",
          title: "Weather",
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Weather unavailable");
    expect(screen.getByText("Set a weather location first.")).toBeInTheDocument();
  });

  test("renders Jellyfin recent media as a filterable poster row", async () => {
    const user = userEvent.setup();
    render(
      <EnhancedWidgetRenderer
        openUrl="http://media.example.test:8096"
        service={{ color: "#7e5bef", iconKey: "jellyfin", iconKind: "preset", name: "Jellyfin" }}
        style={{ accentColor: "#7e5bef", backgroundOpacity: 0.76, radius: 20 }}
        template={{ name: "Recently Added" }}
        widget={{
          enhancedData: {
            counts: { all: 3, movies: 1, music: 0, shows: 2, today: 2, week: 3 },
            items: [
              {
                detailUrl: "http://media.example.test:8096/web/#/details?id=movie-1",
                group: "movies",
                id: "movie-1",
                imageUrl: "/api/services/service-jellyfin/enhancement/media-image/movie-1?imageType=Primary&maxHeight=360",
                isLatest: true,
                runtimeTicks: 64200000000,
                title: "Quiet Shore",
                type: "Movie",
                year: 2024,
              },
              {
                detailUrl: "http://media.example.test:8096/web/#/details?id=episode-1",
                group: "shows",
                id: "episode-1",
                imageUrl: null,
                seasonEpisode: "S1 E4",
                title: "Signal Window",
                type: "Episode",
                year: 2026,
              },
              {
                detailUrl: "http://media.example.test:8096/web/#/details?id=episode-2",
                group: "shows",
                id: "episode-2",
                imageUrl: null,
                seasonEpisode: "S1 E5",
                title: "Long Night",
                type: "Episode",
                year: 2026,
              },
            ],
            syncedAt: "2026-07-05T08:21:00.000Z",
          },
          enhancedRenderer: { dataPath: "recent", fields: [], renderer: "recent-media-row" },
          enhancedStateStatus: "ok",
          title: "Recently Added",
        }}
      />,
    );

    expect(screen.getByText("2 new today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open Quiet Shore in Jellyfin \(opens in new tab\)/i })).toHaveAttribute(
      "href",
      "http://media.example.test:8096/web/#/details?id=movie-1",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Showing 3 recently added items for All");
    expect(screen.getByText("Latest")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Music" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Shows" }));

    expect(screen.getByRole("button", { name: "Shows" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Quiet Shore")).not.toBeInTheDocument();
    expect(screen.getByText("Signal Window")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 2 recently added items for Shows");
  });

  test("renders recent items without destinations as static content instead of dead links", () => {
    render(
      <EnhancedWidgetRenderer
        service={{ color: "#7e5bef", iconKey: "jellyfin", iconKind: "preset", name: "Jellyfin" }}
        style={{ accentColor: "#7e5bef", backgroundOpacity: 0.76, radius: 20 }}
        template={{ name: "Recently Added" }}
        widget={{
          enhancedData: {
            counts: { all: 1, movies: 1, music: 0, shows: 0, today: 1, week: 1 },
            items: [
              {
                group: "movies",
                id: "movie-1",
                imageUrl: null,
                isLatest: true,
                runtimeTicks: 64200000000,
                title: "Quiet Shore",
                type: "Movie",
                year: 2024,
              },
            ],
          },
          enhancedRenderer: { renderer: "recent-media-row" },
          enhancedStateStatus: "ok",
          title: "Recently Added",
        }}
      />,
    );

    expect(screen.getByText("Quiet Shore")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /quiet shore/i })).not.toBeInTheDocument();
  });

  test("renders Jellyfin recent media empty and querying states accessibly", () => {
    const { rerender } = render(
      <EnhancedWidgetRenderer
        openUrl="http://media.example.test:8096"
        service={{ color: "#7e5bef", iconKey: "jellyfin", iconKind: "preset", name: "Jellyfin" }}
        style={{ accentColor: "#7e5bef", backgroundOpacity: 0.76, radius: 20 }}
        template={{ name: "Recently Added" }}
        widget={{
          enhancedData: {},
          enhancedRenderer: { renderer: "recent-media-row" },
          enhancedStateStatus: "querying",
          title: "Recently Added",
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading recent Jellyfin media");

    rerender(
      <EnhancedWidgetRenderer
        openUrl="http://media.example.test:8096"
        service={{ color: "#7e5bef", iconKey: "jellyfin", iconKind: "preset", name: "Jellyfin" }}
        style={{ accentColor: "#7e5bef", backgroundOpacity: 0.76, radius: 20 }}
        template={{ name: "Recently Added" }}
        widget={{
          enhancedData: { counts: { all: 0, today: 0, week: 0 }, items: [] },
          enhancedRenderer: { renderer: "recent-media-row" },
          enhancedStateStatus: "ok",
          title: "Recently Added",
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("No recent additions");
  });
});
