#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { join, extname, relative } from "node:path";

const root = process.argv[2] ?? "dist";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(relative(root, full).split("\\").join("/"));
  }
  return out;
}

const index = await readFile(join(root, "index.html"), "utf8");

let listed;
try {
  const manifest = JSON.parse(await readFile(join(root, "artifact_manifest.json"), "utf8"));
  listed = manifest.files.map((file) => file.path);
} catch {
  listed = await walk(root);
}

const paths = [...new Set(["index.html", ...listed.filter((path) => path !== "artifact_manifest.json")])];

const server = createServer(async (req, res) => {
  try {
    const pathname =
      decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "") ||
      "index.html";
    const file = join(root, pathname);
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

let failed = 0;
for (const path of paths) {
  const response = await fetch(`http://127.0.0.1:${port}/${path}`);
  if (!response.ok) {
    failed += 1;
    console.error(`FAIL ${path}: HTTP ${response.status}`);
  }
}

if (/(?:src|href)="\/(?!\/)/.test(index)) {
  failed += 1;
  console.error("index.html 含绝对路径引用");
}

server.close();

if (failed) {
  console.error(`H5 静态闭环失败：${failed} 项`);
  process.exit(1);
}

console.log(`H5 静态闭环通过：${paths.length} 个资源均 200，入口无绝对路径`);