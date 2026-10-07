import type { MemoryDataRepository } from "../data/repository.js";
import type { EvidenceKind } from "../data/model.js";
import type { JevBatchContext, JevEvidenceRef, JevRole, JevRoleView } from "./model.js";

const roleEvidenceKinds: Record<JevRole, EvidenceKind[]> = {
  production: ["production"],
  inspection: ["inspection", "cold_chain", "shipment"],
  consumer_feedback: ["production", "inspection", "cold_chain", "shipment", "purchase", "consumer_feedback"],
};

export function buildJevContext(repository: MemoryDataRepository, batchId: string): JevBatchContext {
  const batch = repository.getBatch(batchId);
  if (!batch) throw new Error("JEV context 的 batch 不存在");
  const product = repository.getProduct(batch.productId);
  if (!product) throw new Error("JEV context 的 product 不存在");

  const evidence: JevEvidenceRef[] = repository.listEvidence(batchId).map((record) => ({
    evidenceId: record.evidenceId,
    batchId: record.batchId,
    kind: record.kind,
    issuerId: record.issuerId,
    sourceKind: record.sourceKind,
    occurredAt: record.occurredAt,
    payload: { ...record.payload },
    payloadHash: record.payloadHash,
    status: record.status,
    dataMode: record.dataMode,
  }));
  return {
    schemaVersion: "jev.context.v1",
    entity: "fish_oil_batch",
    product,
    batch,
    claims: [...product.claims],
    evidence,
  };
}

export function buildJevRoleView(context: JevBatchContext, role: JevRole): JevRoleView {
  const allowedEvidenceKinds = roleEvidenceKinds[role];
  return {
    schemaVersion: "jev.view.v1",
    role,
    context: {
      ...context,
      claims: [...context.claims],
      evidence: context.evidence.filter((item) => allowedEvidenceKinds.includes(item.kind)),
    },
    allowedEvidenceKinds: [...allowedEvidenceKinds],
  };
}
