import { createReadStream, existsSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: http: https:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
  ].join("; "),
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    ...SECURITY_HEADERS,
  });
  response.end(message);
}

function sendFile(request, response, filePath) {
  const extension = extname(filePath);

  response.writeHead(200, {
    "cache-control": extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    "content-type": MIME_TYPES[extension] || "application/octet-stream",
    ...SECURITY_HEADERS,
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

export function createStaticAssetHandler({ staticDir }) {
  const root = resolve(staticDir);

  return function serveStaticAsset(request, response) {
    let decodedPath;

    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      decodedPath = decodeURIComponent(requestUrl.pathname);
    } catch {
      sendText(response, 400, "Bad request");
      return;
    }

    const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
    const filePath = resolve(root, `.${requestedPath}`);
    const relativePath = relative(root, filePath);
    const isInsideRoot = relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath);

    if (!isInsideRoot) {
      sendText(response, 404, "Not found");
      return;
    }

    if (existsSync(filePath)) {
      sendFile(request, response, filePath);
      return;
    }

    const fallbackPath = join(root, "index.html");

    if (!existsSync(fallbackPath)) {
      sendText(response, 404, "Not found");
      return;
    }

    sendFile(request, response, fallbackPath);
  };
}
