#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const roots = ["src/App.tsx", "src/components", "src/lib"];

const rules = [
  { re: /@tauri-apps/g, msg: "@tauri-apps 直依赖" },
  { re: /\bfetch\s*\(/g, msg: "裸 fetch(" },
  { re: /\blocalStorage\b/g, msg: "直接 localStorage" },
  { re: /\bplatform\s*===/g, msg: "platform === 分支" },
  { re: /\bplatform\s*!==/g, msg: "platform !== 分支" },
];

async function walk(target) {
  const out = [];
  try {
    const entries = await readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(target, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(full)));
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
    }
    return out;
  } catch {
    return [target];
  }
}

const files = [];
for (const root of roots) {
  files.push(...(await walk(root)));
}

const violations = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const rule of rules) {
      if (rule.re.test(line)) {
        violations.push(`${file}:${index + 1}  ${rule.msg}`);
      }
      rule.re.lastIndex = 0;
    }
  });
}

if (violations.length) {
  console.error("平台边界检查失败：");
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}

console.log(`平台边界检查通过：${files.length} 个文件无违规`);