import assert from "node:assert/strict";
import test from "node:test";
import { buildJevContext, buildJevRoleView } from "../src/jev/context.js";
import { canonicalJevJson } from "../src/jev/canonical.js";
import { fishOilBatch, fishOilEvidence, fishOilProduct } from "../src/data/fixtures.js";
import { MemoryDataRepository } from "../src/data/repository.js";

async function repositoryWithFixture(): Promise<MemoryDataRepository> {
  const repository = new MemoryDataRepository();
  repository.createProduct(fishOilProduct);
  repository.createBatch(fishOilBatch);
  for (const evidence of fishOilEvidence) await repository.addEvidence(evidence);
  return repository;
}

test("builds one JEV context from the data-layer records", async () => {
  const context = buildJevContext(await repositoryWithFixture(), fishOilBatch.batchId);
  assert.equal(context.schemaVersion, "jev.context.v1");
  assert.equal(context.entity, "fish_oil_batch");
  assert.equal(context.batch.batchId, fishOilBatch.batchId);
  assert.deepEqual(context.evidence.map((item) => item.evidenceId), [
    "ev-production-001",
    "ev-inspection-001",
    "ev-cold-chain-001",
  ]);
  assert.equal(context.evidence[1]?.payload.epaDhaPercent, 78);
  assert.equal(context.evidence[1]?.payload.totox, 11);
});

test("builds different read-only views without changing the fact source", async () => {
  const context = buildJevContext(await repositoryWithFixture(), fishOilBatch.batchId);
  const production = buildJevRoleView(context, "production");
  const inspection = buildJevRoleView(context, "inspection");
  const consumer = buildJevRoleView(context, "consumer_feedback");

  assert.deepEqual(production.context.evidence.map((item) => item.kind), ["production"]);
  assert.deepEqual(inspection.context.evidence.map((item) => item.kind), ["inspection", "cold_chain"]);
  assert.equal(consumer.context.evidence.length, 3);
  assert.equal(context.evidence.length, 3);
});

test("JEV output is canonical and stable across object key order", async () => {
  const context = buildJevContext(await repositoryWithFixture(), fishOilBatch.batchId);
  const view = buildJevRoleView(context, "inspection");
  assert.equal(canonicalJevJson(view), canonicalJevJson({ ...view, context: { ...view.context, claims: [...view.context.claims] } }));
});

test("rejects a JEV context for an unknown batch", () => {
  const repository = new MemoryDataRepository();
  assert.throws(() => buildJevContext(repository, "FO-UNKNOWN"), /batch 不存在/);
});
