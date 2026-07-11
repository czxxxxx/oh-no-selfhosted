const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(body));
}

export function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

export async function readJsonBody(request, { maxBytes = 64 * 1024 } = {}) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > maxBytes) {
      throw new Error("Request body is too large");
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}
