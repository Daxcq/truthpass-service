import assert from "node:assert/strict";
import test from "node:test";
import { ServiceRegistry } from "../src/registry.js";
import type { ServiceAdapter, ServiceCard, TaskRequest } from "../src/types.js";

const task: TaskRequest = {
  taskId: "route-task",
  serviceKind: "lab",
  capability: "fish-oil-batch-quality-check",
  batchId: "FO-1",
  productionTime: "2026-10-06T08:00:00Z",
  acceptance: { requireSignature: true, policyId: "fish-oil-quality", policyVersion: "v1" },
};

function adapter(card: ServiceCard, reportBatchId: string): ServiceAdapter {
  return {
    async probe() {
      return {
        serviceId: card.id,
        status: "healthy",
        latencyMs: 10,
        capabilityMatch: true,
        schemaValid: true,
        checkedAt: "2026-10-06T08:01:00Z",
      };
    },
    async execute(request) {
      return {
        serviceId: card.id,
        taskId: request.taskId,
        batchId: request.batchId,
        reportBatchId,
        productionTime: request.productionTime,
        reportTime: "2026-10-06T10:00:00Z",
        logisticsGapHours: 1,
        signatureValid: true,
        payload: { evidenceMode: "demo/synthetic" },
      };
    },
  };
}

function card(id: string, historicalScore: number): ServiceCard {
  return {
    id,
    name: id,
    kind: "lab",
    endpoint: `https://example.test/${id}`,
    capabilities: ["fish-oil-batch-quality-check"],
    signer: `signer-${id}`,
    historicalScore,
    feedbackCount: 10,
  };
}

test("filters failed service execution before ranking", async () => {
  const registry = new ServiceRegistry();
  const historicallyTrusted = card("historically-trusted", 99);
  const valid = card("valid", 70);
  registry.register(historicallyTrusted, adapter(historicallyTrusted, "FO-other"));
  registry.register(valid, adapter(valid, "FO-1"));

  const ranked = await registry.evaluate(task);

  assert.equal(ranked[0]?.service.id, "valid");
  assert.equal(ranked[0]?.eligible, true);
  assert.equal(ranked[1]?.service.id, "historically-trusted");
  assert.equal(ranked[1]?.eligible, false);
});
