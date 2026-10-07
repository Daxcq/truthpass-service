import assert from "node:assert/strict";
import test from "node:test";
import { AgentContractError, parseAgentInput, parseAgentOutput } from "../src/agents/contracts.js";
import { fishOilBatch, fishOilEvidence, fishOilProduct } from "../src/data/fixtures.js";
import { MemoryDataRepository } from "../src/data/repository.js";
import { buildJevContext, buildJevRoleView } from "../src/jev/context.js";
import { getPolicySnapshot } from "../src/rules/policy.js";

async function inputs() {
  const repository = new MemoryDataRepository();
  repository.createProduct(fishOilProduct);
  repository.createBatch(fishOilBatch);
  for (const item of fishOilEvidence) await repository.addEvidence(item);
  const context = buildJevContext(repository, fishOilBatch.batchId);
  const feedback = { feedbackId: "fb-demo-001", batchId: fishOilBatch.batchId, rating: 4, categories: ["packaging"], evidenceHash: "a".repeat(64), purchaseBinding: "registered_only" as const };
  return {
    production: { schemaVersion: "agent.input.v1", role: "production", view: buildJevRoleView(context, "production") },
    inspection: { schemaVersion: "agent.input.v1", role: "inspection", view: buildJevRoleView(context, "inspection"), policy: getPolicySnapshot("fish-oil-quality", "v1") },
    consumer_feedback: { schemaVersion: "agent.input.v1", role: "consumer_feedback", view: buildJevRoleView(context, "consumer_feedback"), feedbacks: [feedback] },
  };
}

const productionOutput = { schemaVersion: "agent.output.v1", role: "production", batchId: fishOilBatch.batchId, findings: [{ code: "production_record_found", summary: "找到该批次的生产记录", sourceIds: ["ev-production-001"] }] };
const inspectionOutput = { schemaVersion: "agent.output.v1", role: "inspection", batchId: fishOilBatch.batchId, findings: [{ code: "report_batch_linked", summary: "报告指向当前批次", sourceIds: ["ev-inspection-001"] }] };
const consumerOutput = { schemaVersion: "agent.output.v1", role: "consumer_feedback", batchId: fishOilBatch.batchId, themes: [{ code: "packaging_feedback", summary: "有包装方面的体验反馈", sourceIds: ["fb-demo-001"] }], anomalies: [] };

test("accepts all three role-specific input and output contracts", async () => {
  const data = await inputs();
  assert.equal(parseAgentInput("production", data.production).role, "production");
  assert.equal(parseAgentInput("inspection", data.inspection).role, "inspection");
  assert.equal(parseAgentInput("consumer_feedback", data.consumer_feedback).role, "consumer_feedback");
  assert.equal(parseAgentOutput("production", data.production, productionOutput).role, "production");
  assert.equal(parseAgentOutput("inspection", data.inspection, inspectionOutput).role, "inspection");
  assert.equal(parseAgentOutput("consumer_feedback", data.consumer_feedback, consumerOutput).role, "consumer_feedback");
});

test("rejects cross-role views and findings that cite unknown evidence IDs", async () => {
  const data = await inputs();
  assert.throws(() => parseAgentInput("production", data.inspection), AgentContractError);
  assert.throws(() => parseAgentOutput("production", data.production, { ...productionOutput, findings: [{ ...productionOutput.findings[0], sourceIds: ["invented-evidence"] }] }), /不存在的证据/);
});

test("rejects model-generated scores and verdict fields", async () => {
  const data = await inputs();
  assert.throws(() => parseAgentOutput("inspection", data.inspection, { ...inspectionOutput, score: 100, verdict: "trusted" }), /未定义字段/);
});

test("requires every agent finding to cite at least one input source", async () => {
  const data = await inputs();
  assert.throws(
    () => parseAgentOutput("inspection", data.inspection, { ...inspectionOutput, findings: [{ ...inspectionOutput.findings[0], sourceIds: [] }] }),
    /至少一个来源 ID/,
  );
});

test("rejects altered policy snapshots and consumer identity fields", async () => {
  const data = await inputs();
  const altered = { ...data.inspection, policy: { ...data.inspection.policy, thresholds: { ...data.inspection.policy.thresholds, minEpaDhaPercent: 1 } } };
  assert.throws(() => parseAgentInput("inspection", altered), /不一致/);
  const withIdentity = { ...data.consumer_feedback, feedbacks: [{ ...data.consumer_feedback.feedbacks[0], consumerId: "person@example.test" }] };
  assert.throws(() => parseAgentInput("consumer_feedback", withIdentity), /未定义字段/);
});

test("does not let consumer Agent elevate purchase binding to verified", async () => {
  const data = await inputs();
  const overclaim = { ...data.consumer_feedback, feedbacks: [{ ...data.consumer_feedback.feedbacks[0], purchaseBinding: "verified" }] };
  assert.throws(() => parseAgentInput("consumer_feedback", overclaim), /registered_only 或 unverified/);
});
