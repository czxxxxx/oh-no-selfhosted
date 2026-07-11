import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ICON_MAX_BYTES = 256 * 1024;
const CONTENT_TYPE_EXTENSIONS = [
  ["image/png", "png"],
  ["image/svg+xml", "svg"],
  ["image/webp", "webp"],
  ["image/x-icon", "ico"],
  ["image/vnd.microsoft.icon", "ico"],
];

function extensionFor(contentType = "") {
  const normalized = contentType.toLowerCase();
  const match = CONTENT_TYPE_EXTENSIONS.find(([type]) => normalized.includes(type));

  return match?.[1] || "ico";
}

export async function resolveFavicon({ dataDir, fetchImpl = fetch, url }) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    return { iconKind: "default", iconKey: "custom" };
  }

  const faviconUrl = new URL("/favicon.ico", parsed.origin).toString();

  try {
    const response = await fetchImpl(faviconUrl, {
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) {
      return { iconKind: "default", iconKey: "custom" };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.length === 0 || bytes.length > ICON_MAX_BYTES) {
      return { iconKind: "default", iconKey: "custom" };
    }

    const extension = extensionFor(response.headers.get("content-type") || "");
    const filename = `${createHash("sha256").update(parsed.origin).digest("hex")}.${extension}`;
    const iconDir = join(dataDir, "icon-cache");

    await mkdir(iconDir, { recursive: true });
    await writeFile(join(iconDir, filename), bytes);

    return {
      iconKind: "favicon",
      iconUrl: `/api/icons/${filename}`,
    };
  } catch {
    return { iconKind: "default", iconKey: "custom" };
  }
}
