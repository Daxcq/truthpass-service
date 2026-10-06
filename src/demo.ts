import { ServiceRegistry } from "./registry.js";
import type { ServiceAdapter, ServiceCard, TaskRequest } from "./types.js";

const task: TaskRequest = {
  taskId: "task-tea-2026-001",
  serviceKind: "lab",
  capability: "batch-quality-check",
  batchId: "TEA-2026-001",
  productionTime: "2026-10-06T08:00:00Z",
  acceptance: { requireSignature: true, maxLogisticsGapHours: 6 },
};

function adapterFor(card: ServiceCard, mode: "valid" | "wrong-batch" | "offline"): ServiceAdapter {
  return {
    async probe(request) {
      if (mode === "offline") {
        return {
          serviceId: card.id,
          status: "offline",
          latencyMs: 0,
          capabilityMatch: false,
          schemaValid: false,
          checkedAt: new Date().toISOString(),
          reason: "连接超时",
        };
      }
      return {
        serviceId: card.id,
        status: mode === "valid" ? "healthy" : "degraded",
        latencyMs: mode === "valid" ? 420 : 980,
        capabilityMatch: true,
        schemaValid: true,
        checkedAt: new Date().toISOString(),
      };
    },
    async execute(request) {
      return {
        serviceId: card.id,
        taskId: request.taskId,
        batchId: request.batchId,
        reportBatchId: mode === "wrong-batch" ? "TEA-2026-000" : request.batchId,
        productionTime: request.productionTime,
        reportTime: "2026-10-06T10:20:00Z",
        logisticsGapHours: mode === "valid" ? 2 : 4,
        signatureValid: mode === "valid",
        payload: { moisture: 6.2, pesticideScreening: "pass" },
      };
    },
  };
}

const services: Array<[ServiceCard, "valid" | "wrong-batch" | "offline"]> = [
  [
    {
      id: "lab-a",
      name: "山野检测服务",
      kind: "lab",
      endpoint: "https://example.test/lab-a",
      capabilities: ["batch-quality-check"],
      signer: "0x1111...aaaa",
      historicalScore: 92,
      feedbackCount: 14,
    },
    "wrong-batch",
  ],
  [
    {
      id: "lab-b",
      name: "快速检测服务",
      kind: "lab",
      endpoint: "https://example.test/lab-b",
      capabilities: ["batch-quality-check"],
      signer: "0x2222...bbbb",
      historicalScore: 96,
      feedbackCount: 9,
    },
    "offline",
  ],
  [
    {
      id: "lab-c",
      name: "可信实验室",
      kind: "lab",
      endpoint: "https://example.test/lab-c",
      capabilities: ["batch-quality-check"],
      signer: "0x3333...cccc",
      historicalScore: 88,
      feedbackCount: 21,
    },
    "valid",
  ],
];

const registry = new ServiceRegistry();
for (const [card, mode] of services) registry.register(card, adapterFor(card, mode));

const ranked = await registry.evaluate(task);
const winner = ranked[0];
if (!winner?.verification) throw new Error("没有可验收的服务");
const feedback = await registry.recordFeedback(winner.service.id, task, winner.verification);

console.log(JSON.stringify({
  task,
  ranking: ranked.map((item) => ({
    serviceId: item.service.id,
    liveStatus: item.probe.status,
    score: item.score,
    accepted: item.verification?.status ?? "not-executed",
    reasons: item.verification?.reasons ?? [item.probe.reason],
  })),
  selectedService: winner.service.id,
  feedback,
}, null, 2));
