import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = normalize(fileURLToPath(new URL("../", import.meta.url)));
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4173);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = normalize(join(root, relative));
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

const server = createServer(async (request, response) => {
  try {
    let filepath = safePath(request.url ?? "/");
    if (!filepath) {
      response.writeHead(400).end("Bad request");
      return;
    }

    try {
      const info = await stat(filepath);
      if (info.isDirectory()) filepath = join(filepath, "index.html");
    } catch {
      response.writeHead(404).end("Not found");
      return;
    }

    const body = await readFile(filepath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filepath)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "Origin-Agent-Cluster": "?1",
      "Permissions-Policy": "tools=(self)",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500).end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, host, () => {
  console.log(`Scopebox running at http://${host}:${port}`);
  console.log(`Local tool simulator: http://${host}:${port}/?debug=1`);
});
