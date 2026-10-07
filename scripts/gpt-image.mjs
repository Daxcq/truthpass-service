#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

async function loadEnv() {
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return;
  const txt = await readFile(p, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

await loadEnv();

const API_KEY = process.env.LINOROUTE_API_KEY;
const BASE_URL = (process.env.LINOROUTE_BASE_URL || "https://linoroute.com/v1").replace(/\/+$/, "");
const MODEL = process.env.LINOROUTE_MODEL || "gpt-image-2";

function fail(msg) { console.error("✗ " + msg); process.exit(1); }
async function ensureDir(p) { await mkdir(dirname(p), { recursive: true }); }

async function materialize(item) {
  if (item.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item.url) {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error("下载图片失败: HTTP " + res.status);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("响应中没有 b64_json 或 url 字段");
}

async function writeImages(json, out) {
  const items = json.data || [];
  if (!items.length) fail("接口返回空结果: " + JSON.stringify(json));
  for (let i = 0; i < items.length; i++) {
    const buf = await materialize(items[i]);
    const file = items.length === 1 ? out : out.replace(/\.(\w+)$/i, `-${i}.$1`);
    await ensureDir(file);
    await writeFile(file, buf);
    console.log(`✔ ${file} (${buf.length} bytes)`);
  }
}

async function cmdGenerate(prompt, size, out) {
  if (!prompt) fail('用法: node scripts/gpt-image.mjs generate "提示词" [--size 1024x1024] [--out path.png]');
  const body = { model: MODEL, prompt, n: 1, size: size || "1024x1024" };
  const res = await fetch(`${BASE_URL}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) fail(`HTTP ${res.status}: ${text.slice(0, 600)}`);
  await writeImages(JSON.parse(text), out);
}

function parse(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--size") args.size = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else args._.push(a);
  }
  return args;
}

if (!API_KEY) fail("缺少 LINOROUTE_API_KEY（请检查仓库根目录 .env）");

const [cmd, ...rest] = process.argv.slice(2);
const args = parse(rest);
const prompt = args._[0];

if (cmd === "generate") await cmdGenerate(prompt, args.size, args.out);
else fail('仅支持 generate 命令');
