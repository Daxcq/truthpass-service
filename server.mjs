import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TypesafeClient } from "./src/typesafe/api.ts";
import { MemoryDataRepository } from "./src/data/repository.ts";
import { fishOilBatch, fishOilEvidence, fishOilProduct } from "./src/data/fixtures.ts";
import { buildProductionPublicSummary } from "./src/production.ts";
import { answerConsumerQuestion } from "./src/agents/consumer-assistant.ts";
import { runAgentCollaboration } from "./src/agents/collaboration.ts";
import { createCompatibleAgentInvoker } from "./src/agents/compatible-invoker.ts";
import { buildJevContext, buildJevRoleView } from "./src/jev/context.ts";
import { getPolicySnapshot } from "./src/rules/policy.ts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WEB_DIST = join(__dirname, "web", "dist");
const WEB = existsSync(WEB_DIST) ? WEB_DIST : join(__dirname, "web");
const EXAMPLES = join(__dirname, "examples");
const PORT = process.env.PORT || 4173;
const typesafe = new TypesafeClient();
const invokeAgent = createCompatibleAgentInvoker();
const productionRepository = new MemoryDataRepository();
productionRepository.createProduct(fishOilProduct);
productionRepository.createBatch(fishOilBatch);
for (const evidence of fishOilEvidence) await productionRepository.addEvidence(evidence);
const productionProcess = await buildProductionPublicSummary(productionRepository, fishOilBatch.batchId);
const observerData = {
  task: "task-fish-oil-2026-001",
  policy: "fish-oil-quality-v1",
  jev: "route_to_rule · 0.94 · demo",
  evidenceRoot: "0xb436…dca6",
  chainStatus: "待锚定 · 可重试",
  services: [
    { id: "lab-c", history: 88, live: "online", verdict: "passed" },
    { id: "lab-a", history: 92, live: "degraded", verdict: "rejected" },
    { id: "lab-b", history: 96, live: "offline", verdict: "not-called" },
  ],
};

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

async function runJevDetection() {
  const response = await typesafe.run({
    state: {
      schemaVersion: "jev-truthpass-state-v1",
      taskId: "task-fish-oil-2026-001",
      batchId: "FO-2026-001",
      policyId: "fish-oil-quality",
      dataMode: "demo/synthetic",
      requestedChecks: ["epa_dha", "oxidation", "cold_chain"],
      evidenceSummary: {
        reportBatchMatches: true,
        epaDhaPresent: true,
        peroxidePresent: true,
        totoxPresent: true,
        coldChainPresent: true,
        heavyMetalsPresent: false,
        serviceOnline: true,
        signatureValid: true,
      },
      metrics: { epaDhaPercent: 78, peroxideValue: 2.1, totox: 11, coldChainGapHours: 2 },
    },
    questions: {
      route: {
        type: "choice",
        instructions: "在不替代确定性规则验收的前提下，选择证据完成后的下一步路由。",
        criteria: {
          route_to_rule_verifier: "关键证据齐全且无冲突，可以交给确定性规则验收。",
          request_more_evidence: "缺少关键证据，应先补充材料。",
          route_to_recheck: "证据冲突或状态不稳定，应进入复检。",
        },
      },
      evidence_scope: {
        type: "choice",
        instructions: "判断当前证据覆盖范围，不要推断未提供的事实。",
        criteria: {
          quality_and_cold_chain: "覆盖含量、氧化指标和冷链。",
          incomplete: "仍有质量或冷链字段缺失。",
        },
      },
    },
  });

  return {
    source: "TypeSafe JEV",
    model: response.model,
    answers: { route: response.answers.route, evidence_scope: response.answers.evidence_scope },
    usage: response.usage,
    deterministicVerifier: { status: "accepted", policy: "fish-oil-quality@v1" },
  };
}

function sseWrite(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

async function analyzeWithAgents(question, evidenceCard) {
  if (!process.env.AGENT_API_KEY || !process.env.AGENT_MODEL) return { status: "not_configured", findings: [] };
  try {
    const context = buildJevContext(productionRepository, fishOilBatch.batchId);
    const productionInput = { schemaVersion: "agent.input.v1", role: "production", view: buildJevRoleView(context, "production") };
    const inspectionInput = { schemaVersion: "agent.input.v1", role: "inspection", view: buildJevRoleView(context, "inspection"), policy: getPolicySnapshot("fish-oil-quality", "v1") };
    const result = await runAgentCollaboration(productionInput, inspectionInput, question, evidenceCard, invokeAgent);
    return { status: "completed", response: result.consumer.response, sourceIds: result.consumer.sourceIds };
  } catch (error) {
    console.error("[agent] advisory model unavailable:", error instanceof Error ? error.message : "unknown error");
    return { status: "unavailable", findings: [] };
  }
}

function modelLines(result) {
  if (result.status === "completed") return [{ cls: "plain", text: result.response + (result.sourceIds.length ? " 依据：" + result.sourceIds.join("、") : "") }];
  const message = "消费者模型辅助" + (result.status === "not_configured" ? "尚未配置" : "暂不可用") + "；以上回答仍基于已登记证据卡与代码结果。";
  return [{ cls: "disclaimer", text: message }];
}

function streamChat(req, res) {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    let last = "";
    try {
      const parsed = JSON.parse(body || "{}");
      const msgs = parsed.messages || [];
      last = (msgs[msgs.length - 1]?.content) || "";
    } catch {
      last = "";
    }
    const snapshot = {
      batchId: fishOilBatch.batchId,
      dataMode: fishOilBatch.dataMode,
      decision: "not_assessed",
      decisionReasons: [],
      evidence: productionRepository.listEvidence(fishOilBatch.batchId).map((item) => ({
        evidenceId: item.evidenceId,
        kind: item.kind,
        issuerId: item.issuerId,
        sourceKind: item.sourceKind,
        status: item.status,
        dataMode: item.dataMode,
        signature: item.attestation ? "not_checked" : "missing",
      })),
    };
    const answer = answerConsumerQuestion(last, snapshot);
    const modelResult = analyzeWithAgents(last, answer);
    const script = [
      { cls: "cmd", text: "$ zhenyan ask --batch " + answer.batchId },
      { cls: "lead", text: "这批鱼油 " + answer.batchId },
      { cls: "conclusion", text: answer.headline },
      ...answer.facts.map((text) => ({ cls: "plain", text })),
      ...answer.uncertainties.map((text) => ({ cls: "disclaimer", text })),
      ...answer.nextActions.map((text) => ({ cls: "conclusion", text: "建议：" + text })),
    ];
    if (process.env.AGENT_API_KEY && process.env.AGENT_MODEL) {
      script.splice(3, 0, { cls: "plain", text: "正在整理消费者易读说明（不参与验收或反馈提交）…" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseWrite(res, { kind: "begin", intent: "consumer_evidence" });

    let i = 0;
    const next = () => {
      if (res.writableEnded || res.destroyed) return;
      if (i >= script.length) {
        void modelResult.then((result) => {
          if (res.writableEnded || res.destroyed) return;
          for (const line of modelLines(result)) sseWrite(res, { kind: "line", cls: line.cls, text: line.text });
          sseWrite(res, { kind: "done" });
          res.end();
        });
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

  if (p === "/api/jev/detection" && req.method === "GET") {
    try {
      return sendJson(res, 200, await runJevDetection());
    } catch (error) {
      return sendJson(res, 502, { error: "JEV_UNAVAILABLE", message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (p === "/api/observer" && req.method === "GET") {
    return sendJson(res, 200, observerData);
  }

  if (p === "/api/agent/chat" && req.method === "POST") {
    streamChat(req, res);
    return true;
  }

  const productMatch = p.match(/^\/api\/products\/([^/]+)\/?$/);
  const evidenceMatch = p.match(/^\/api\/products\/([^/]+)\/evidence-link\/?$/);
  const journeyMatch = p.match(/^\/api\/products\/([^/]+)\/journey\/?$/);
  const productionMatch = p.match(/^\/api\/products\/([^/]+)\/production\/?$/);
  const metricMatch = p.match(/^\/api\/products\/([^/]+)\/metrics\/([^/]+)\/?$/);

  try {
    if (productMatch) {
      if (productMatch[1] !== "FO-2026-001") return sendJson(res, 404, { error: "batch not found" });
      return sendJson(res, 200, { ...(await readJson("fo-2026-001-batch.json")), productionProcess });
    }
    if (evidenceMatch) {
      if (evidenceMatch[1] !== "FO-2026-001") return sendJson(res, 404, { error: "batch not found" });
      return sendJson(res, 200, await readJson("fo-evidence-link.json"));
    }
    if (journeyMatch) {
      if (journeyMatch[1] !== "FO-2026-001") return sendJson(res, 404, { error: "batch not found" });
      return sendJson(res, 200, await readJson("fo-journey.json"));
    }
    if (productionMatch) {
      if (productionMatch[1] !== "FO-2026-001") return sendJson(res, 404, { error: "batch not found" });
      return sendJson(res, 200, productionProcess);
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
