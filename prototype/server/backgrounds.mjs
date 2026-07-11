import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const BACKGROUND_TYPES = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const BACKGROUND_CONTENT_TYPES = Object.fromEntries(
  Object.entries(BACKGROUND_TYPES).map(([contentType, extension]) => [`.${extension}`, contentType]),
);
const BACKGROUND_ID_PATTERN = /^custom-([a-f0-9]{64})$/;
const BACKGROUND_FILE_PATTERN = /^[a-f0-9]{64}\.(avif|gif|jpg|png|webp)$/;
const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;

function backgroundDir(dataDir) {
  return join(dataDir, "backgrounds");
}

function metadataPath(dataDir, hash) {
  return join(backgroundDir(dataDir), `${hash}.json`);
}

function publicBackground(metadata) {
  return {
    createdAt: metadata.createdAt,
    id: metadata.id,
    imageUrl: `/api/backgrounds/files/${metadata.imageFilename}`,
    name: metadata.name,
    sizeBytes: metadata.sizeBytes,
  };
}

function uploadedBackgroundName(filename) {
  const extension = extname(String(filename || ""));
  const name = basename(String(filename || "Custom background"), extension)
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 80);

  return name || "Custom background";
}

export async function saveUploadedBackground({ dataDir, dataUrl, filename, now = () => new Date().toISOString() }) {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,(.+)$/);

  if (!match) {
    throw new Error("Background upload must be a base64 image data URL");
  }

  const [, contentType, base64] = match;
  const extension = BACKGROUND_TYPES[contentType];

  if (!extension) {
    throw new Error("Background must be a JPG, PNG, WEBP, GIF, or AVIF image");
  }

  const bytes = Buffer.from(base64, "base64");

  if (bytes.length === 0 || bytes.length > MAX_BACKGROUND_BYTES) {
    throw new Error("Background image must be smaller than 10 MB");
  }

  const hash = createHash("sha256").update(bytes).digest("hex");
  const directory = backgroundDir(dataDir);
  const imageFilename = `${hash}.${extension}`;
  const metadata = {
    contentType,
    createdAt: now(),
    id: `custom-${hash}`,
    imageFilename,
    name: uploadedBackgroundName(filename),
    sizeBytes: bytes.length,
  };

  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, imageFilename), bytes);
  await writeFile(metadataPath(dataDir, hash), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  return publicBackground(metadata);
}

export async function listUploadedBackgrounds({ dataDir }) {
  let filenames;

  try {
    filenames = await readdir(backgroundDir(dataDir));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const backgrounds = await Promise.all(
    filenames
      .filter((filename) => /^[a-f0-9]{64}\.json$/.test(filename))
      .map(async (filename) => {
        try {
          const metadata = JSON.parse(await readFile(join(backgroundDir(dataDir), filename), "utf8"));

          if (
            !BACKGROUND_ID_PATTERN.test(metadata.id) ||
            !BACKGROUND_FILE_PATTERN.test(metadata.imageFilename) ||
            !existsSync(join(backgroundDir(dataDir), metadata.imageFilename))
          ) {
            return null;
          }

          return publicBackground(metadata);
        } catch {
          return null;
        }
      }),
  );

  return backgrounds
    .filter(Boolean)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

export async function deleteUploadedBackground({ dataDir, id }) {
  const match = String(id || "").match(BACKGROUND_ID_PATTERN);

  if (!match) {
    return false;
  }

  const hash = match[1];
  const sidecarPath = metadataPath(dataDir, hash);

  if (!existsSync(sidecarPath)) {
    return false;
  }

  let metadata;

  try {
    metadata = JSON.parse(await readFile(sidecarPath, "utf8"));
  } catch {
    metadata = null;
  }

  const imageFilename = BACKGROUND_FILE_PATTERN.test(metadata?.imageFilename || "")
    ? metadata.imageFilename
    : null;

  await Promise.all([
    imageFilename ? rm(join(backgroundDir(dataDir), imageFilename), { force: true }) : Promise.resolve(),
    rm(sidecarPath, { force: true }),
  ]);

  return true;
}

export function serveUploadedBackground({ dataDir, filename, response }) {
  const safeFilename = basename(decodeURIComponent(filename));

  if (!BACKGROUND_FILE_PATTERN.test(safeFilename)) {
    return false;
  }

  const filePath = join(backgroundDir(dataDir), safeFilename);

  if (!existsSync(filePath)) {
    return false;
  }

  response.writeHead(200, {
    "cache-control": "public, max-age=31536000, immutable",
    "content-type": BACKGROUND_CONTENT_TYPES[extname(safeFilename)] || "application/octet-stream",
    "x-content-type-options": "nosniff",
  });
  createReadStream(filePath).pipe(response);

  return true;
}
