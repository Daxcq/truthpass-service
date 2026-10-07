import { sha256Hex } from "../hash.js";
import { canonicalJson } from "./canonical.js";
import type { BatchRecord, EvidenceRecord, NewEvidenceRecord, ProductRecord } from "./model.js";
import { validateBatch, validateEvidence, validateProduct } from "./validation.js";

export class MemoryDataRepository {
  private readonly products = new Map<string, ProductRecord>();
  private readonly batches = new Map<string, BatchRecord>();
  private readonly evidence = new Map<string, EvidenceRecord>();

  createProduct(product: ProductRecord): ProductRecord {
    assertValid(validateProduct(product));
    if (this.products.has(product.productId)) throw new Error("productId 已存在");
    this.products.set(product.productId, product);
    return product;
  }

  createBatch(batch: BatchRecord): BatchRecord {
    assertValid(validateBatch(batch));
    if (!this.products.has(batch.productId)) throw new Error("batch 绑定的 product 不存在");
    if (this.batches.has(batch.batchId)) throw new Error("batchId 已存在");
    this.batches.set(batch.batchId, batch);
    return batch;
  }

  async addEvidence(input: NewEvidenceRecord): Promise<EvidenceRecord> {
    assertValid(validateEvidence(input));
    if (!this.batches.has(input.batchId)) throw new Error("evidence 绑定的 batch 不存在");
    if (this.evidence.has(input.evidenceId)) throw new Error("evidenceId 已存在");
    const record: EvidenceRecord = {
      ...input,
      payloadHash: await sha256Hex(canonicalJson(input.payload)),
      status: "submitted",
      createdAt: new Date().toISOString(),
    };
    this.evidence.set(record.evidenceId, record);
    return record;
  }

  getProduct(productId: string): ProductRecord | undefined {
    return this.products.get(productId);
  }

  getBatch(batchId: string): BatchRecord | undefined {
    return this.batches.get(batchId);
  }

  getEvidence(evidenceId: string): EvidenceRecord | undefined {
    return this.evidence.get(evidenceId);
  }

  listEvidence(batchId: string): EvidenceRecord[] {
    return [...this.evidence.values()].filter((record) => record.batchId === batchId);
  }
}

function assertValid(result: { ok: boolean; errors: string[] }): asserts result is { ok: true; errors: [] } {
  if (!result.ok) throw new Error(result.errors.join("；"));
}
