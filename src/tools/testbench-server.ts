import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fishOilBatch, fishOilEvidence, fishOilProduct } from "../data/fixtures.js";
import { MemoryDataRepository } from "../data/repository.js";
import { TruthPassTools, ToolBoundaryError } from "./truthpass-tools.js";
import type { JevRole } from "../jev/model.js";
import type { TaskRequest } from "../types.js";
import { AgentContractError, parseAgentInput, parseAgentOutput, type AgentRole } from "../agents/contracts.js";
import { getPolicySnapshot } from "../rules/policy.js";

const task: TaskRequest = {
  taskId: "task-fish-oil-2026-001",
  serviceKind: "lab",
  capability: "fish-oil-batch-quality-check",
  batchId: fishOilBatch.batchId,
  productionTime: fishOilBatch.productionAt,
  acceptance: { requireSignature: true, policyId: "fish-oil-quality", policyVersion: "v1" },
};

const repository = new MemoryDataRepository();
repository.createProduct(fishOilProduct);
repository.createBatch(fishOilBatch);
for (const item of fishOilEvidence) await repository.addEvidence(item);
repository.createBatch({ ...fishOilBatch, batchId: "FO-OTHER", fillingBatchId: "FILL-OTHER" });
for (const [evidenceId, batchId] of [["ev-test-report-001", task.batchId], ["ev-test-report-other", "FO-OTHER"]] as const) {
  await repository.addEvidence({
    schemaVersion: "evidence.v1", evidenceId, batchId, kind: "inspection",
    issuerId: "lab-demo-001", sourceKind: "third_party",
    occurredAt: "2026-10-06T10:00:00Z", dataMode: "demo/synthetic",
    payload: {
      taskId: task.taskId, reportBatchId: batchId, logisticsGapHours: 2, signatureValid: true,
      epaDhaPercent: 78, peroxideValue: 2.1, totox: 11, coldChainGapHours: 2,
    },
  });
}

const tools = new Map<JevRole, TruthPassTools>(
  (["production", "inspection", "consumer_feedback"] as const).map((role) => [role, new TruthPassTools(repository, role)]),
);
const inspectionTools = tools.get("inspection")!;

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function bodyJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk.toString();
    if (raw.length > 16_384) throw new ToolBoundaryError("请求体过大", "REQUEST_TOO_LARGE");
  }
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ToolBoundaryError("请求体必须是 JSON 对象", "INVALID_REQUEST");
  return parsed as Record<string, unknown>;
}

function statusFor(error: unknown): number {
  if (error instanceof AgentContractError) return 400;
  if (!(error instanceof ToolBoundaryError)) return 400;
  if (error.code === "TOOL_FORBIDDEN") return 403;
  if (["BATCH_NOT_FOUND", "EVIDENCE_NOT_FOUND", "POLICY_NOT_FOUND"].includes(error.code)) return 404;
  return 400;
}

function agentTestInput(role: AgentRole): { input: unknown; sampleOutput: unknown } {
  const view = tools.get(role)!.getEvidenceView({ batchId: task.batchId });
  const input = role === "production"
    ? { schemaVersion: "agent.input.v1", role, view }
    : role === "inspection"
      ? { schemaVersion: "agent.input.v1", role, view, policy: getPolicySnapshot("fish-oil-quality", "v1") }
      : { schemaVersion: "agent.input.v1", role, view, feedbacks: [{ feedbackId: "fb-demo-001", batchId: task.batchId, rating: 4, categories: ["packaging"], evidenceHash: "a".repeat(64), purchaseBinding: "registered_only" }] };
  parseAgentInput(role, input);

  const sampleOutput = role === "consumer_feedback"
    ? { schemaVersion: "agent.output.v1", role, batchId: task.batchId, themes: [{ code: "packaging_feedback", summary: "有包装方面的体验反馈", sourceIds: ["fb-demo-001"] }], anomalies: [] }
    : { schemaVersion: "agent.output.v1", role, batchId: task.batchId, findings: [{ code: role === "production" ? "production_record_found" : "inspection_report_found", summary: role === "production" ? "找到该批次的生产记录" : "找到该批次的检测报告", sourceIds: [role === "production" ? "ev-production-001" : "ev-inspection-001"] }] };
  return { input, sampleOutput };
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/") {
      const html = await readFile(resolve(process.cwd(), "testbench/tools-layer.html"));
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(html);
      return;
    }

    if (request.method === "GET" && url.pathname === "/agent-contracts") {
      const html = await readFile(resolve(process.cwd(), "testbench/agent-contracts.html"));
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(html);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/test/agents/input") {
      const role = url.searchParams.get("role") as AgentRole;
      if (!["production", "inspection", "consumer_feedback"].includes(role)) throw new ToolBoundaryError("未知 Agent role", "AGENT_ROLE_INVALID");
      json(response, 200, agentTestInput(role));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/test/agents/validate") {
      const body = await bodyJson(request);
      if (Object.keys(body).some((key) => !["role", "output"].includes(key))) throw new ToolBoundaryError("测试端点只接受 role 和 output", "INVALID_REQUEST");
      const role = body.role as AgentRole;
      if (!["production", "inspection", "consumer_feedback"].includes(role)) throw new ToolBoundaryError("未知 Agent role", "AGENT_ROLE_INVALID");
      const { input } = agentTestInput(role);
      const parsed = parseAgentOutput(role, input, body.output);
      json(response, 200, { valid: true, role, batchId: task.batchId, output: parsed });
      return;
    }

    const roleMatch = url.pathname.match(/^\/api\/test\/(production|inspection|consumer_feedback)\/evidence$/);
    if (request.method === "GET" && roleMatch) {
      const role = roleMatch[1] as JevRole;
      const batchId = url.searchParams.get("batchId") ?? "";
      json(response, 200, { result: tools.get(role)!.getEvidenceView({ batchId }) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/test/role-upgrade") {
      const batchId = url.searchParams.get("batchId") ?? "";
      const production = tools.get("production")!;
      const forged = production.getEvidenceView as unknown as (input: { batchId: string }, role: string) => unknown;
      json(response, 200, { result: forged.call(production, { batchId }, url.searchParams.get("role") ?? "consumer_feedback") });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/test/batch") {
      json(response, 200, { result: tools.get("production")!.getBatch({ batchId: url.searchParams.get("batchId") ?? "" }) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/test/policy") {
      json(response, 200, { result: inspectionTools.getPolicy({ policyId: url.searchParams.get("policyId") ?? "", policyVersion: url.searchParams.get("policyVersion") ?? "" }) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/test/assess") {
      const body = await bodyJson(request);
      const input = { task, evidenceId: typeof body.evidenceId === "string" ? body.evidenceId : "" };
      json(response, 200, { serviceExecution: await inspectionTools.verifyServiceExecution(input), productAssessment: await inspectionTools.assessProductBatch(input) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/test/assess-unregistered") {
      const body = await bodyJson(request);
      const forged = inspectionTools.assessProductBatch as unknown as (input: Record<string, unknown>) => Promise<unknown>;
      json(response, 200, { result: await forged.call(inspectionTools, { task, evidence: body.evidence }) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/test/assess-other-batch") {
      json(response, 200, { result: await inspectionTools.assessProductBatch({ task, evidenceId: "ev-test-report-other" }) });
      return;
    }

    json(response, 404, { error: "NOT_FOUND", message: "测试台路由不存在" });
  } catch (error) {
    json(response, statusFor(error), {
      error: error instanceof ToolBoundaryError ? error.code : error instanceof AgentContractError ? "AGENT_CONTRACT_INVALID" : "TESTBENCH_ERROR",
      path: error instanceof AgentContractError ? error.path : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

const port = Number(process.env.TESTBENCH_PORT ?? 4173);
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`TruthPass tool testbench: http://127.0.0.1:${port}\n`);
});
