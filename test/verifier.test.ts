import assert from "node:assert/strict";
import test from "node:test";
import { verifyExecution } from "../src/verifier.js";
import type { ExecutionEvidence, TaskRequest } from "../src/types.js";

const task: TaskRequest = {
  taskId: "task-1",
  serviceKind: "lab",
  capability: "batch-quality-check",
  batchId: "B-1",
  productionTime: "2026-10-06T08:00:00Z",
  acceptance: { requireSignature: true, maxLogisticsGapHours: 6 },
};

const evidence: ExecutionEvidence = {
  serviceId: "lab-c",
  taskId: "task-1",
  batchId: "B-1",
  reportBatchId: "B-1",
  productionTime: "2026-10-06T08:00:00Z",
  reportTime: "2026-10-06T10:00:00Z",
  logisticsGapHours: 2,
  signatureValid: true,
  payload: { result: "pass" },
};

test("accepts matching signed evidence", async () => {
  const result = await verifyExecution(task, evidence);
  assert.equal(result.status, "accepted");
  assert.equal(result.score, 100);
  assert.equal(result.reasons.length, 0);
});

test("rejects evidence for another batch", async () => {
  const result = await verifyExecution(task, { ...evidence, reportBatchId: "B-2" });
  assert.equal(result.status, "rejected");
  assert.match(result.reasons.join(" "), /批次/);
});
