import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { sendError } from "./http.mjs";

const ICON_CONTENT_TYPES = {
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const UPLOAD_ICON_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/x-icon": "ico",
};

export async function saveUploadedIcon({ dataDir, dataUrl }) {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,(.+)$/);

  if (!match) throw new Error("Icon upload must be a base64 image data URL");

  const [, contentType, base64] = match;
  const extension = UPLOAD_ICON_TYPES[contentType];

  if (!extension) throw new Error("Icon upload must be PNG, JPG, WEBP, or ICO");

  const bytes = Buffer.from(base64, "base64");

  if (bytes.length === 0 || bytes.length > 512 * 1024) {
    throw new Error("Icon upload must be smaller than 512 KB");
  }

  const iconDir = join(dataDir, "icon-cache");
  const filename = `${createHash("sha256").update(bytes).digest("hex")}.${extension}`;

  await mkdir(iconDir, { recursive: true });
  await writeFile(join(iconDir, filename), bytes);

  return { iconKey: "custom", iconKind: "url", iconUrl: `/api/icons/${filename}` };
}

export function serveIcon({ dataDir, requestUrl, response }) {
  const filename = basename(decodeURIComponent(requestUrl.pathname.replace("/api/icons/", "")));

  if (!/^[a-f0-9]{64}\.(ico|jpe?g|png|webp)$/.test(filename)) {
    sendError(response, 404, "Icon not found");
    return;
  }

  const filePath = join(dataDir, "icon-cache", filename);

  if (!existsSync(filePath)) {
    sendError(response, 404, "Icon not found");
    return;
  }

  response.writeHead(200, {
    "cache-control": "public, max-age=31536000, immutable",
    "content-type": ICON_CONTENT_TYPES[extname(filename)] || "application/octet-stream",
    "x-content-type-options": "nosniff",
  });
  createReadStream(filePath).pipe(response);
}
