import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson } from "../src/data/canonical.js";
import { fishOilBatch, fishOilEvidence, fishOilProduct } from "../src/data/fixtures.js";
import { MemoryDataRepository } from "../src/data/repository.js";
import { validateBatch, validateEvidence, validateProduct } from "../src/data/validation.js";

test("stores a valid fish-oil product, batch, and evidence chain", async () => {
  const repository = new MemoryDataRepository();
  repository.createProduct(fishOilProduct);
  repository.createBatch(fishOilBatch);
  const stored = await repository.addEvidence(fishOilEvidence[1]);

  assert.equal(repository.getProduct(fishOilProduct.productId)?.productId, fishOilProduct.productId);
  assert.equal(repository.getBatch(fishOilBatch.batchId)?.batchId, fishOilBatch.batchId);
  assert.equal(stored.status, "submitted");
  assert.match(stored.payloadHash, /^[0-9a-f]{64}$/);
  assert.equal(stored.dataMode, "demo/synthetic");
});

test("rejects invalid records before persistence", () => {
  assert.equal(validateProduct({ ...fishOilProduct, productId: "" }).ok, false);
  assert.equal(validateBatch({ ...fishOilBatch, productionAt: "not-a-date" }).ok, false);
  assert.equal(validateEvidence({ ...fishOilEvidence[0], kind: "unknown" }).ok, false);
});

test("enforces product, batch, and evidence foreign-key boundaries", async () => {
  const repository = new MemoryDataRepository();
  assert.throws(() => repository.createBatch(fishOilBatch), /product 不存在/);
  repository.createProduct(fishOilProduct);
  repository.createBatch(fishOilBatch);
  await assert.rejects(() => repository.addEvidence({ ...fishOilEvidence[0], batchId: "FO-UNKNOWN" }), /batch 不存在/);
});

test("rejects duplicate IDs and preserves append-only records", async () => {
  const repository = new MemoryDataRepository();
  repository.createProduct(fishOilProduct);
  repository.createBatch(fishOilBatch);
  await repository.addEvidence(fishOilEvidence[0]);

  assert.throws(() => repository.createProduct(fishOilProduct), /productId 已存在/);
  assert.throws(() => repository.createBatch(fishOilBatch), /batchId 已存在/);
  await assert.rejects(() => repository.addEvidence(fishOilEvidence[0]), /evidenceId 已存在/);
  assert.equal(repository.listEvidence(fishOilBatch.batchId).length, 1);
});

test("canonical JSON hashes equivalent object key order identically", () => {
  assert.equal(
    canonicalJson({ b: 2, a: { d: 4, c: 3 } }),
    canonicalJson({ a: { c: 3, d: 4 }, b: 2 }),
  );
});
