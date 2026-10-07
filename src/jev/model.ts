import type { BatchRecord, EvidenceRecord, ProductRecord } from "../data/model.js";

export type JevRole = "production" | "inspection" | "consumer_feedback";
export type JevEvidenceStatus = "submitted" | "revoked";

export interface JevEvidenceRef {
  evidenceId: string;
  batchId: string;
  kind: EvidenceRecord["kind"];
  issuerId: string;
  sourceKind: EvidenceRecord["sourceKind"];
  occurredAt: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  status: JevEvidenceStatus;
  dataMode: EvidenceRecord["dataMode"];
}

export interface JevBatchContext {
  schemaVersion: "jev.context.v1";
  entity: "fish_oil_batch";
  product: ProductRecord;
  batch: BatchRecord;
  claims: string[];
  evidence: JevEvidenceRef[];
}

export interface JevRoleView {
  schemaVersion: "jev.view.v1";
  role: JevRole;
  context: JevBatchContext;
  allowedEvidenceKinds: EvidenceRecord["kind"][];
}
