import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WEB_DIST = join(__dirname, "web", "dist");
const WEB = existsSync(WEB_DIST) ? WEB_DIST : join(__dirname, "web");
const EXAMPLES = join(__dirname, "examples");
const PORT = process.env.PORT || 4173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
  return res;
}

async function readJson(name) {
  return JSON.parse(await readFile(join(EXAMPLES, name), "utf8"));
}

const chatScripts = {
  default: [
    { cls: "cmd", text: "$ zhenyan check --batch FO-2026-001" },
    { cls: "plain", text: "正在查询多源证据..." },
    { cls: "check", text: "✓ 读取设备采集数据" },
    { cls: "check", text: "✓ 关联检测报告" },
    { cls: "check", text: "✓ 执行规则验收（9 项）" },
    { cls: "check", text: "✓ 验证链上记录" },
    { cls: "check", text: "✓ 生成结论..." },
    { cls: "lead", text: "这批鱼油 FO-2026-001" },
    { cls: "conclusion", text: "按当前规则通过。" },
    { cls: "conclusion", text: "基于设备采集、检测报告、冷链记录与链上锚定等多源证据，未发现与规则冲突的异常。" },
    { cls: "conclusion", text: "该结论适用于当前公开的规则与数据范围。" },
    { cls: "disclaimer", text: "ⓘ 这是基于现有证据综合判断，并不代表对未来或其他批次的保证。" },
  ],
  origin: [
    { cls: "cmd", text: "$ zhenyan origin --batch FO-2026-001" },
    { cls: "check", text: "✓ 读取生产档案" },
    { cls: "check", text: "✓ 核对来源声明" },
    { cls: "conclusion", text: "原料来自北太平洋海域，生产日期 2026-01-12。" },
    { cls: "conclusion", text: "全程冷链运输，经海关清关后进入保税仓。" },
    { cls: "disclaimer", text: "以上为厂商自报来源，演示数据 demo/synthetic。" },
  ],
  metrics: [
    { cls: "cmd", text: "$ zhenyan metrics --batch FO-2026-001" },
    { cls: "check", text: "✓ 读取第三方检测报告" },
    { cls: "conclusion", text: "EPA+DHA 78%（门槛 ≥70%）；过氧化值 2.1 meq/kg（≤5）；TOTOX 11（≤20）；冷链中断 2h（≤6h）。" },
    { cls: "conclusion", text: "检测签名有效，报告批次与商品批次一致。" },
  ],
  rules: [
    { cls: "cmd", text: "$ zhenyan rules --v1.0" },
    { cls: "check", text: "✓ 任务匹配 · 批次匹配 · 时间逻辑 · 签名有效 · 物流连续" },
    { cls: "check", text: "✓ EPA+DHA · 过氧化值 · TOTOX · 冷链" },
    { cls: "conclusion", text: "当前规则共 9 项，本批次全部通过，判定为 accepted。" },
  ],
  cold: [
    { cls: "cmd", text: "$ zhenyan coldchain --batch FO-2026-001" },
    { cls: "check", text: "✓ 读取温度传感器记录" },
    { cls: "check", text: "✓ 校验冷链连续性" },
    { cls: "conclusion", text: "全程冷链，累计中断 2 小时，未超过 6 小时上限。" },
  ],
  fallback: [
    { cls: "plain", text: "抱歉，我目前只能回答该批次已公开的产地、检测项、规则与冷链证据。" },
    { cls: "conclusion", text: "其他问题请咨询对应服务方。" },
  ],
};

function detectIntent(text) {
  if (/产地|来源|海域|在哪|哪里/.test(text)) return "origin";
  if (/检测|指标|含量|过氧化|epa|dha|totox/i.test(text)) return "metrics";
  if (/规则|怎么判定|为什么通过|标准/.test(text)) return "rules";
  if (/冷链|温度|物流|运输/.test(text)) return "cold";
  if (/质量|值得|信|怎么样|如何|可靠/.test(text)) return "default";
  return "fallback";
}

function sseWrite(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function streamChat(req, res) {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let last = "";
    try {
      const parsed = JSON.parse(body || "{}");
      const msgs = parsed.messages || [];
      last = (msgs[msgs.length - 1]?.content) || "";
    } catch {
      last = "";
    }
    const intent = detectIntent(last);
    const script = chatScripts[intent] || chatScripts.fallback;

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseWrite(res, { kind: "begin", intent });

    let i = 0;
    const next = () => {
      if (res.writableEnded || res.destroyed) return;
      if (i >= script.length) {
        sseWrite(res, { kind: "done" });
        res.end();
        return;
      }
      const line = script[i++];
      sseWrite(res, { kind: "line", cls: line.cls, text: line.text });
      setTimeout(next, line.cls === "conclusion" ? 260 : 210);
    };
    next();

    res.on("error", () => {});
    req.on("close", () => {});
  });
}

async function handleApi(url, req, res) {
  const p = url.pathname;

  if (p === "/api/agent/chat" && req.method === "POST") {
    streamChat(req, res);
    return true;
  }

  const productMatch = p.match(/^\/api\/products\/([^/]+)\/?$/);
  const evidenceMatch = p.match(/^\/api\/products\/([^/]+)\/evidence-link\/?$/);
  const journeyMatch = p.match(/^\/api\/products\/([^/]+)\/journey\/?$/);
  const metricMatch = p.match(/^\/api\/products\/([^/]+)\/metrics\/([^/]+)\/?$/);

  try {
    if (productMatch) {
      if (productMatch[1] !== "FO-2026-001") return sendJson(res, 404, { error: "batch not found" });
      return sendJson(res, 200, await readJson("fo-2026-001-batch.json"));
    }
    if (evidenceMatch) {
      if (evidenceMatch[1] !== "FO-2026-001") return sendJson(res, 404, { error: "batch not found" });
      return sendJson(res, 200, await readJson("fo-evidence-link.json"));
    }
    if (journeyMatch) {
      if (journeyMatch[1] !== "FO-2026-001") return sendJson(res, 404, { error: "batch not found" });
      return sendJson(res, 200, await readJson("fo-journey.json"));
    }
    if (metricMatch) {
      if (metricMatch[1] !== "FO-2026-001") return sendJson(res, 404, { error: "batch not found" });
      const metrics = await readJson("fo-metrics.json");
      const detail = metrics[metricMatch[2]];
      if (!detail) return sendJson(res, 404, { error: "metric not found" });
      return sendJson(res, 200, detail);
    }
  } catch (e) {
    return sendJson(res, 500, { error: String(e) });
  }

  return false;
}

async function handleStatic(url, res) {
  const pathname = decodeURIComponent(url.pathname);
  let filePath = pathname === "/" ? join(WEB, "index.html") : join(WEB, normalize(pathname));
  if (!filePath.startsWith(WEB)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    const handled = await handleApi(url, req, res);
    if (!handled) sendJson(res, 404, { error: "not found" });
    return;
  }

  await handleStatic(url, res);
});

server.listen(PORT, () => {
  console.log(`真验前端已启动: http://localhost:${PORT}`);
});
