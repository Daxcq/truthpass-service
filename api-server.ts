/**
 * 本地测试用对接层：把 src/ 的真实模块通过 HTTP 暴露给前端 web/。
 * 注意：不修改 src/ 的任何文件，仅作为前端与后端之间的适配器。
 * 运行：npm run api  （tsx api-server.ts）
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MemoryDataRepository } from "./src/data/repository.js";
import { fishOilBatch, fishOilEvidence, fishOilProduct } from "./src/data/fixtures.js";
import { getPolicySnapshot } from "./src/rules/policy.js";
import { assessProductionBatch } from "./src/production.js";
import { ServiceRegistry } from "./src/registry.js";
import { ConsumerParticipationRegistry } from "./src/consumer.js";
import { TruthPassTools } from "./src/tools/truthpass-tools.js";
import { TrustedIssuerKeyRegistry, type TrustedIssuerPublicKey } from "./src/security/evidence-signatures.js";
import { createPostgresReplayGuard, persistenceEnabled } from "./src/data/persistence.js";
import type { ServiceAdapter, ServiceCard, TaskRequest } from "./src/types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WEB_DIST = join(__dirname, "web", "dist");
const WEB = existsSync(WEB_DIST) ? WEB_DIST : join(__dirname, "web");
const PORT = Number(process.env.PORT || 4173);
const BATCH_ID = "FO-2026-001";

// ---------- 初始化数据仓库（fixtures） ----------
const repository = new MemoryDataRepository();
repository.createProduct(fishOilProduct);
repository.createBatch(fishOilBatch);
for (const item of fishOilEvidence) await repository.addEvidence(item);
const productionAssessment = await assessProductionBatch(repository, BATCH_ID);

// 补一条结构完整的 inspection 证据，供确定性验收使用（对齐 testbench 的做法）。
await repository.addEvidence({
  schemaVersion: "evidence.v1",
  evidenceId: "ev-test-report-001",
  batchId: BATCH_ID,
  kind: "inspection",
  issuerId: "lab-demo-001",
  sourceKind: "third_party",
  occurredAt: "2026-10-06T10:20:00Z",
  dataMode: "demo/synthetic",
  payload: {
    taskId: "task-fish-oil-2026-001",
    reportBatchId: BATCH_ID,
    logisticsGapHours: 2,
    signatureValid: true,
    epaDhaPercent: 78,
    peroxideValue: 2.1,
    totox: 11,
    coldChainGapHours: 2,
  },
});

// ---------- 任务与验收 ----------
const task: TaskRequest = {
  taskId: "task-fish-oil-2026-001",
  serviceKind: "lab",
  capability: "fish-oil-batch-quality-check",
  batchId: BATCH_ID,
  productionTime: "2026-10-06T08:00:00Z",
  acceptance: { requireSignature: true, policyId: "fish-oil-quality", policyVersion: "v1" },
};

const inspectionEvidence = repository.getEvidence("ev-test-report-001")!;
const trustedIssuerKeys = new TrustedIssuerKeyRegistry(
  JSON.parse(process.env.TRUTHPASS_TRUSTED_ISSUER_KEYS ?? "[]") as TrustedIssuerPublicKey[],
);
const replayGuard = persistenceEnabled() ? createPostgresReplayGuard() : undefined;
const inspectionTools = new TruthPassTools(repository, "inspection", trustedIssuerKeys.resolve, true, replayGuard);

const policy = getPolicySnapshot(task.acceptance.policyId, task.acceptance.policyVersion);
const assessment = await inspectionTools.assessProductBatch({ task, evidenceId: "ev-test-report-001" });

// ---------- 服务注册（评委观察台用，三个候选服务） ----------
function adapterFor(card: ServiceCard, mode: "valid" | "wrong-batch" | "offline"): ServiceAdapter {
  return {
    async probe() {
      if (mode === "offline") {
        return {
          serviceId: card.id,
          status: "offline" as const,
          latencyMs: 0,
          capabilityMatch: false,
          schemaValid: false,
          checkedAt: new Date().toISOString(),
          reason: "连接超时",
        };
      }
      return {
        serviceId: card.id,
        status: mode === "valid" ? ("healthy" as const) : ("degraded" as const),
        latencyMs: mode === "valid" ? 420 : 980,
        capabilityMatch: true,
        schemaValid: true,
        checkedAt: new Date().toISOString(),
      };
    },
    async execute() {
      return {
        serviceId: card.id,
        taskId: task.taskId,
        batchId: task.batchId,
        reportBatchId: mode === "wrong-batch" ? "FO-2026-000" : task.batchId,
        productionTime: task.productionTime,
        reportTime: "2026-10-06T10:20:00Z",
        logisticsGapHours: mode === "valid" ? 2 : 4,
        signatureValid: mode === "valid",
        epaDhaPercent: mode === "valid" ? 78 : 61,
        peroxideValue: mode === "valid" ? 2.1 : 7.2,
        totox: mode === "valid" ? 11 : 26,
        coldChainGapHours: mode === "valid" ? 2 : 11,
        payload: { product: fishOilProduct.name, dataMode: "demo/synthetic" },
      };
    },
  };
}

const services: Array<[ServiceCard, "valid" | "wrong-batch" | "offline"]> = [
  [
    { id: "lab-a", name: "山野检测服务", kind: "lab", endpoint: "https://example.test/lab-a", capabilities: ["fish-oil-batch-quality-check"], signer: "0x1111...aaaa", historicalScore: 92, feedbackCount: 14 },
    "wrong-batch",
  ],
  [
    { id: "lab-b", name: "快速检测服务", kind: "lab", endpoint: "https://example.test/lab-b", capabilities: ["fish-oil-batch-quality-check"], signer: "0x2222...bbbb", historicalScore: 96, feedbackCount: 9 },
    "offline",
  ],
  [
    { id: "lab-c", name: "可信实验室", kind: "lab", endpoint: "https://example.test/lab-c", capabilities: ["fish-oil-batch-quality-check"], signer: "0x3333...cccc", historicalScore: 88, feedbackCount: 21 },
    "valid",
  ],
];

const registry = new ServiceRegistry(trustedIssuerKeys.resolve, replayGuard);
for (const [card, mode] of services) registry.register(card, adapterFor(card, mode), "demo/synthetic");

// ---------- 消费者共建 ----------
const consumers = new ConsumerParticipationRegistry();
const consumerId = "consumer-demo-001";
await consumers.grantConsent({
  consumerId,
  batchId: BATCH_ID,
  scopes: ["purchase", "packaging", "odor", "storage", "quality-feedback"],
  grantedAt: "2026-10-06T12:00:00Z",
});
const purchase = await consumers.recordPurchase({
  consumerId,
  batchId: BATCH_ID,
  purchaseProofHash: "demo-purchase-proof-001",
  createdAt: "2026-10-06T12:05:00Z",
});

// ---------- 视图适配（展示配置集中在这里） ----------
const METRIC_VIEWS = [
  { key: "epa-dha", icon: "fish", label: "EPA+DHA", value: "78%", unit: "检测结果（占总脂肪酸）", bar: 78, status: "pass" },
  { key: "peroxide", icon: "warning", label: "过氧化值", value: "2.1", unit: "meq/kg", bar: 42, status: "pass" },
  { key: "cold-chain", icon: "snowflake", label: "冷链", value: "2小时", unit: "全程温度异常时长", bar: 33, status: "pass" },
  { key: "heavy-metal", icon: "alert", label: "重金属报告", value: "—", unit: "未覆盖 · 可继续调用独立检测服务", bar: 12, status: "missing" },
];

const EVIDENCE_STEPS = [
  { step: 1, icon: "sensor", title: "设备采集", source: "船舱传感器 · 温度 / 湿度 / 定位", description: "船上与加工环节的传感器数据，记录捕捞、加工、温度等关键信息。", hash: "0x9a1f4c2e8b0d77a31e5f9c2d4b6a8e10", verifiedAt: "2026-10-06T08:30:00Z" },
  { step: 2, icon: "agent", title: "Agent 关联", source: "Zhenyan Agent · 多源数据关联", description: "Zhenyan Agent 将多源数据关联，形成可验证的证据包。", hash: "0xb7c2d9a4e10f3c8b6d2a5f7e9c1b4d80", verifiedAt: "2026-10-06T12:00:00Z" },
  { step: 3, icon: "jev", title: "JEV 判别", source: "JEV 决策门 · route_to_rule · 0.94", description: "用固定类型输出识别证据缺口、冲突和下一步路由。", hash: "0x7c1e3d5a8f2b9c4e6a0d7f1b3c5e9a2d", verifiedAt: "2026-10-06T13:40:00Z" },
  { step: 4, icon: "rule", title: "规则验收", source: `规则引擎 ${policy.policyId}@${policy.version}`, description: "按食品安全与质量规则进行自动化验收，生成结论与置信范围。", hash: assessment.evidenceHash, verifiedAt: inspectionEvidence.occurredAt },
  { step: 5, icon: "chain", title: "链上锚定", source: "链上锚定 · 不可篡改", description: "关键证据哈希上链，确保记录不可篡改、可长期验证。", hash: "0xe3a9b5c7d1f2e8a4c6b0d9f1e3a7c5b2", verifiedAt: "2026-10-06T14:05:00Z" },
];

const JOURNEY_STEPS = [
  { step: 1, title: "捕捞与提炼", description: "渔船捕捞 → 原料提炼，生产哈希上链", hash: "0x1a2b3c4d5e6f708192a3b4c5d6e7f809" },
  { step: 2, title: "第三方检测", description: "SGS 检测报告 + 4 步过程证据上链", hash: "0x2b3c4d5e6f708192a3b4c5d6e7f8091a" },
  { step: 3, title: "跨境物流", description: "全程冷链运输，物流哈希上链", hash: "0x3c4d5e6f708192a3b4c5d6e7f8091a2b" },
  { step: 4, title: "海关清关", description: "入境检验检疫，海关哈希上链", hash: "0x4d5e6f708192a3b4c5d6e7f8091a2b3c" },
  { step: 5, title: "保税仓入库", description: "保税仓入库，入库哈希上链", hash: "0x5e6f708192a3b4c5d6e7f8091a2b3c4d" },
  { step: 6, title: "出库销售", description: "出库销售，销售哈希上链", hash: "0x6f708192a3b4c5d6e7f8091a2b3c4d5e" },
];

// ---------- HTTP 工具 ----------
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) raw += chunk.toString();
  if (!raw) return {};
  return JSON.parse(raw);
}

// ---------- SSE（对话暂用结构化脚本，后续替换为 Agent 合同） ----------
const chatScripts: Record<string, Array<{ cls: string; text: string }>> = {
  default: [
    { cls: "cmd", text: "$ zhenyan check --batch FO-2026-001" },
    { cls: "check", text: "✓ 读取设备采集数据" },
    { cls: "check", text: "✓ 关联检测报告" },
    { cls: "check", text: "✓ 执行规则验收（9 项）" },
    { cls: "check", text: "✓ 验证链上记录" },
    { cls: "lead", text: "这批鱼油 FO-2026-001" },
    { cls: "conclusion", text: `按当前规则${assessment.status === "accepted" ? "通过" : "未通过"}。` },
    { cls: "conclusion", text: "基于设备采集、检测报告、冷链记录与链上锚定等多源证据，未发现与规则冲突的异常。" },
    { cls: "disclaimer", text: "ⓘ 这是基于现有证据综合判断，并不代表对未来或其他批次的保证。" },
  ],
  origin: [
    { cls: "cmd", text: "$ zhenyan origin --batch FO-2026-001" },
    { cls: "conclusion", text: `原料来自${fishOilProduct.name}，生产日期 ${fishOilBatch.productionAt.slice(0, 10)}。` },
    { cls: "disclaimer", text: "以上为厂商自报来源，演示数据 demo/synthetic。" },
  ],
  metrics: [
    { cls: "cmd", text: "$ zhenyan metrics --batch FO-2026-001" },
    { cls: "conclusion", text: `EPA+DHA ${assessment.checks.epaDhaWithinLimit ? "78%" : "不达标"}；过氧化值 ${assessment.checks.peroxideWithinLimit ? "2.1" : "超标"}；冷链 ${assessment.checks.coldChainWithinLimit ? "2h" : "超限"}。` },
  ],
  rules: [
    { cls: "cmd", text: "$ zhenyan rules --v1.0" },
    { cls: "conclusion", text: `当前 policy ${policy.policyId}@${policy.version}，验收得分 ${assessment.score}/100。` },
  ],
  cold: [
    { cls: "cmd", text: "$ zhenyan coldchain --batch FO-2026-001" },
    { cls: "conclusion", text: `冷链中断 ${inspectionEvidence.payload.coldChainGapHours}h ≤ ${policy.thresholds.maxLogisticsGapHours}h。` },
  ],
  fallback: [
    { cls: "plain", text: "抱歉，我目前只能回答该批次已公开的产地、检测项、规则与冷链证据。" },
  ],
};

function detectIntent(text: string): string {
  if (/产地|来源|海域|在哪|哪里/.test(text)) return "origin";
  if (/检测|指标|含量|过氧化|epa|dha|totox/i.test(text)) return "metrics";
  if (/规则|怎么判定|为什么通过|标准/.test(text)) return "rules";
  if (/冷链|温度|物流|运输/.test(text)) return "cold";
  if (/质量|值得|信|怎么样|如何|可靠/.test(text)) return "default";
  return "fallback";
}

function streamChat(res: ServerResponse, script: Array<{ cls: string; text: string }>): void {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  let i = 0;
  const next = () => {
    if (res.writableEnded || res.destroyed) return;
    if (i >= script.length) {
      res.write("data: " + JSON.stringify({ kind: "done" }) + "\n\n");
      res.end();
      return;
    }
    const line = script[i++];
    res.write("data: " + JSON.stringify({ kind: "line", cls: line.cls, text: line.text }) + "\n\n");
    setTimeout(next, line.cls === "conclusion" ? 260 : 210);
  };
  next();
}

// ---------- 路由 ----------
async function handleApi(url: URL, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const p = url.pathname;

  if (p === "/api/agent/chat" && req.method === "POST") {
    const body = await readBody(req);
    const messages = (body.messages as Array<{ content: string }>) || [];
    const last = messages[messages.length - 1]?.content || "";
    const intent = detectIntent(last);
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });
    res.write("data: " + JSON.stringify({ kind: "begin", intent }) + "\n\n");
    streamChat(res, chatScripts[intent] || chatScripts.fallback);
    return true;
  }

  if (p === "/api/products/FO-2026-001" && req.method === "GET") {
    sendJson(res, 200, {
      batchId: BATCH_ID,
      name: fishOilProduct.name,
      category: fishOilProduct.category,
      origin: "北太平洋海域",
      productionDate: fishOilBatch.productionAt.slice(0, 10),
      supplyChainTags: ["来自纯净海域", "全程冷链", "多重检测", "区块链存证"],
      imageUrl: "/assets/fish-oil-product.png",
      verification: {
        status: assessment.status,
        summary: assessment.status === "accepted" ? "基于多源证据的综合判断" : assessment.reasons[0],
        scope: `${BATCH_ID} 批次及当前公开的规则 ${policy.version}`,
      },
      productionAssessment,
      keyMetrics: METRIC_VIEWS,
    });
    return true;
  }

  if (p === "/api/products/FO-2026-001/evidence-link" && req.method === "GET") {
    sendJson(res, 200, EVIDENCE_STEPS);
    return true;
  }

  if (p === "/api/products/FO-2026-001/production" && req.method === "GET") {
    sendJson(res, 200, productionAssessment);
    return true;
  }

  if (p === "/api/products/FO-2026-001/journey" && req.method === "GET") {
    sendJson(res, 200, { batchId: BATCH_ID, status: assessment.status === "accepted" ? "verified" : "review", steps: JOURNEY_STEPS });
    return true;
  }

  const metricMatch = p.match(/^\/api\/products\/FO-2026-001\/metrics\/([^/]+)\/?$/);
  if (metricMatch && req.method === "GET") {
    const key = metricMatch[1];
    const view = METRIC_VIEWS.find((m) => m.key === key);
    if (!view) return sendJson(res, 404, { error: "metric not found" });
    const thresholds = policy.thresholds;
    sendJson(res, 200, {
      label: view.label,
      value: view.value,
      unit: view.unit,
      threshold:
        key === "epa-dha" ? `≥ ${thresholds.minEpaDhaPercent}%`
        : key === "peroxide" ? `≤ ${thresholds.maxPeroxideValue}`
        : key === "cold-chain" ? `≤ ${thresholds.maxLogisticsGapHours} 小时`
        : "未覆盖",
      sources: [
        {
          name: key === "cold-chain" ? "冷链温度传感器" : "SGS 检测报告",
          method: key === "cold-chain" ? "每 5 分钟采样" : "第三方检测",
          reportNo: key === "cold-chain" ? "IOT-FO-2026-001" : "SGS-2026-1015-042",
          pdf: "ipfs://QmDemo.../report.pdf",
          time: inspectionEvidence.occurredAt,
          signature: "0x...demo-signature",
        },
      ],
    });
    return true;
  }

  if (p === "/api/observer" && req.method === "GET") {
    const ranking = await registry.evaluate(task);
    sendJson(res, 200, {
      task: task.taskId,
      policy: `${policy.policyId}-${policy.version}`,
      jev: "route_to_rule · 0.94 · demo",
      evidenceRoot: assessment.evidenceHash.slice(0, 10) + "…",
      chainStatus: "待锚定 · 可重试",
      services: ranking.map((r) => ({
        id: r.service.id,
        history: r.service.historicalScore,
        live: r.probe.status === "healthy" ? "online" : r.probe.status === "degraded" ? "degraded" : "offline",
        verdict: r.probe.status === "offline" ? "not-called" : r.execution?.status === "accepted" ? "passed" : "rejected",
      })),
    });
    return true;
  }

  if (p === "/api/feedback" && req.method === "POST") {
    const body = await readBody(req);
    const rating = Number(body.rating || 5);
    const categories = Array.isArray(body.categories) ? (body.categories as string[]) : [];
    const feedback = await consumers.recordFeedback({
      purchaseId: purchase.purchaseId,
      rating: Math.min(5, Math.max(1, rating)),
      categories,
      evidence: { source: "demo/synthetic", note: "消费者 Agent 授权后的体验反馈" },
    });
    sendJson(res, 200, { ok: true, feedbackId: feedback.feedbackId, contributionPoints: feedback.contributionPoints, evidenceHash: feedback.evidenceHash });
    return true;
  }

  return false;
}

async function handleStatic(url: URL, res: ServerResponse): Promise<void> {
  const pathname = decodeURIComponent(url.pathname);
  const filePath = resolve(pathname === "/" ? join(WEB, "index.html") : join(WEB, normalize(pathname)));
  // relative() 判定：目标必须严格落在 WEB 目录内（startsWith 前缀匹配可被兄弟目录绕过）
  const rel = relative(WEB, filePath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const mime: Record<string, string> = {
      ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
      ".jpg": "image/jpeg", ".ico": "image/x-icon",
    };
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    // 固定 base：仅解析 pathname/search，不引入不可信的 Host 头
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(url, req, res);
      if (!handled) sendJson(res, 404, { error: "not found" });
      return;
    }
    await handleStatic(url, res);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`真验 API 对接层已启动: http://localhost:${PORT}`);
});
