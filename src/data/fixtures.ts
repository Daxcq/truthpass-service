import type { BatchRecord, NewEvidenceRecord, ProductRecord } from "./model.js";

export const fishOilProduct: ProductRecord = {
  schemaVersion: "product.v1",
  productId: "fish-oil-demo-001",
  name: "高浓度鱼油软胶囊",
  category: "fish-oil",
  supplierId: "supplier-demo-001",
  claims: ["高浓度 EPA+DHA", "冷链交付"],
  dataMode: "demo/synthetic",
};

export const fishOilBatch: BatchRecord = {
  schemaVersion: "batch.v1",
  batchId: "FO-2026-001",
  productId: fishOilProduct.productId,
  supplierId: fishOilProduct.supplierId,
  productionAt: "2026-10-06T08:00:00Z",
  fillingBatchId: "FILL-2026-001",
  dataMode: "demo/synthetic",
};

export const fishOilEvidence: NewEvidenceRecord[] = [
  {
    schemaVersion: "evidence.v1",
    evidenceId: "ev-production-001",
    batchId: fishOilBatch.batchId,
    kind: "production",
    issuerId: fishOilProduct.supplierId,
    sourceKind: "manufacturer",
    occurredAt: "2026-10-06T08:00:00Z",
    payload: { fillingBatchId: fishOilBatch.fillingBatchId, origin: "demo/synthetic" },
    dataMode: "demo/synthetic",
  },
  {
    schemaVersion: "evidence.v1",
    evidenceId: "ev-inspection-001",
    batchId: fishOilBatch.batchId,
    kind: "inspection",
    issuerId: "lab-demo-001",
    sourceKind: "third_party",
    occurredAt: "2026-10-06T10:20:00Z",
    payload: { epaDhaPercent: 78, peroxideValue: 2.1, totox: 11, reportMode: "demo/synthetic" },
    dataMode: "demo/synthetic",
  },
  {
    schemaVersion: "evidence.v1",
    evidenceId: "ev-cold-chain-001",
    batchId: fishOilBatch.batchId,
    kind: "cold_chain",
    issuerId: "cold-chain-demo-001",
    sourceKind: "platform_device",
    occurredAt: "2026-10-06T11:00:00Z",
    payload: { maxGapHours: 2, sensorMode: "demo/synthetic" },
    dataMode: "demo/synthetic",
  },
];
