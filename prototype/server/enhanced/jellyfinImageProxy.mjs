import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const ALLOWED_IMAGE_TYPES = new Set(["Backdrop", "Logo", "Primary", "Thumb"]);

function baseUrl(config, service) {
  const rawUrl = String(config.baseUrl || service?.url || "").trim();

  if (!rawUrl) {
    throw new Error("Jellyfin service URL is required");
  }

  return rawUrl.replace(/\/$/, "");
}

function token(config) {
  const value = String(config.apiKey || config.accessToken || "").trim();

  if (!value) {
    throw new Error("Jellyfin API key or access token is required");
  }

  return value.replace(/"/g, "");
}

function authHeaders(config) {
  return {
    authorization: `MediaBrowser Client="Oh No Selfhosted", Device="Dashboard", DeviceId="oh-no-selfhosted", Version="0.1.0", Token="${token(config)}"`,
  };
}

function positiveInteger(value, fallback, max) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return fallback;
  }

  return Math.min(number, max);
}

function mediaImageUrl({ config, itemId, requestUrl, service }) {
  const requestedImageType = requestUrl.searchParams.get("imageType");
  const imageType = ALLOWED_IMAGE_TYPES.has(requestedImageType) ? requestedImageType : "Primary";
  const maxHeight = positiveInteger(requestUrl.searchParams.get("maxHeight"), 360, 1000);
  const url = new URL(`Items/${encodeURIComponent(itemId)}/Images/${imageType}`, `${baseUrl(config, service)}/`);

  url.searchParams.set("maxHeight", String(maxHeight));
  url.searchParams.set("quality", "90");

  return url;
}

export async function proxyJellyfinMediaImage({
  adapter,
  config,
  fetchImpl = fetch,
  itemId,
  requestUrl,
  response,
  service,
}) {
  if (adapter?.id !== "jellyfin" && adapter?.manifest?.id !== "jellyfin") {
    throw new Error("Media images are only supported for Jellyfin enhancements");
  }

  const upstream = await fetchImpl(mediaImageUrl({ config, itemId, requestUrl, service }), {
    headers: authHeaders(config),
  });

  if (!upstream.ok) {
    throw new Error(`Jellyfin image fetch failed with HTTP ${upstream.status}`);
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";

  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error("Jellyfin image response was not an image");
  }

  response.writeHead(200, {
    "cache-control": "private, max-age=60",
    "content-type": contentType,
  });

  if (upstream.body && typeof Readable.fromWeb === "function") {
    try {
      await pipeline(Readable.fromWeb(upstream.body), response);
    } catch (error) {
      if (!response.destroyed) {
        response.destroy(error);
      }
    }
    return;
  }

  response.end(Buffer.from(await upstream.arrayBuffer()));
}
