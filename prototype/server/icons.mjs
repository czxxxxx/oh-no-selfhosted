import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { sendError } from "./http.mjs";

const ICON_MAX_BYTES = 512 * 1024;
const SVG_OUTPUT_SIZE = 256;
const SVG_SECURITY_ERROR = "SVG icon contains unsupported active or external content";
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
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/x-icon": "ico",
};

function assertSafeSvg(svg) {
  if (!/<svg(?:\s|>)/i.test(svg)) {
    throw new Error("SVG icon is not a valid SVG document");
  }

  const forbiddenMarkup = [
    /<!DOCTYPE/i,
    /<!ENTITY/i,
    /<\s*(?:script|foreignObject|iframe|object|embed|image|feImage|audio|video|link)\b/i,
    /\s+on[a-z][\w:-]*\s*=/i,
    /\s+xml:base\s*=/i,
    /@import\b/i,
    /javascript\s*:/i,
  ];

  if (forbiddenMarkup.some((pattern) => pattern.test(svg))) {
    throw new Error(SVG_SECURITY_ERROR);
  }

  for (const match of svg.matchAll(/\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gi)) {
    if (!match[2].trim().startsWith("#")) {
      throw new Error(SVG_SECURITY_ERROR);
    }
  }

  if (/\b(?:href|xlink:href)\s*=\s*[^"']/i.test(svg)) {
    throw new Error(SVG_SECURITY_ERROR);
  }

  for (const match of svg.matchAll(/\burl\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    if (!match[2].trim().startsWith("#")) {
      throw new Error(SVG_SECURITY_ERROR);
    }
  }
}

async function rasterizeSvg(bytes) {
  assertSafeSvg(bytes.toString("utf8"));

  try {
    return await sharp(bytes, {
      density: 192,
      failOn: "warning",
      limitInputPixels: 4096 * 4096,
    })
      .resize(SVG_OUTPUT_SIZE, SVG_OUTPUT_SIZE, {
        background: { alpha: 0, b: 0, g: 0, r: 0 },
        fit: "contain",
      })
      .ensureAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (error) {
    if (error.message === SVG_SECURITY_ERROR || error.message === "SVG icon is not a valid SVG document") {
      throw error;
    }

    throw new Error("SVG icon could not be rendered");
  }
}

export async function saveUploadedIcon({ dataDir, dataUrl }) {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,(.+)$/);

  if (!match) throw new Error("Icon upload must be a base64 image data URL");

  const [, contentType, base64] = match;
  const extension = UPLOAD_ICON_TYPES[contentType];

  if (!extension) throw new Error("Icon upload must be PNG, JPG, WEBP, ICO, or SVG");

  const sourceBytes = Buffer.from(base64, "base64");

  if (sourceBytes.length === 0 || sourceBytes.length > ICON_MAX_BYTES) {
    throw new Error("Icon upload must be smaller than 512 KB");
  }

  const bytes = extension === "svg" ? await rasterizeSvg(sourceBytes) : sourceBytes;
  const storedExtension = extension === "svg" ? "png" : extension;

  const iconDir = join(dataDir, "icon-cache");
  const filename = `${createHash("sha256").update(bytes).digest("hex")}.${storedExtension}`;

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
