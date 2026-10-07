import type { MemoryDataRepository } from "./data/repository.js";
import { PRODUCTION_STAGES, type ProductionEvent, type ProductionStage } from "./data/model.js";
import { getProductionPolicySnapshot, type ProductionPolicySnapshot } from "./rules/policy.js";

export type ProductionCoverageStatus = "observed" | "missing" | "restricted" | "not_covered";
export type ProductionAssessmentStatus = "conformant" | "nonconformant" | "incomplete" | "review";

export interface ProductionStageAssessment {
  stage: ProductionStage;
  required: boolean;
  status: ProductionCoverageStatus;
  evidenceIds: string[];
}

export interface ProductionFinding {
  code: string;
  stage?: ProductionStage;
  evidenceIds: string[];
}

export interface ProductionAssessment {
  schemaVersion: "production.assessment.v1";
  batchId: string;
  status: ProductionAssessmentStatus;
  policyId: ProductionPolicySnapshot["policyId"];
  policyVersion: ProductionPolicySnapshot["version"];
  stages: ProductionStageAssessment[];
  findings: ProductionFinding[];
  missingEvidenceCodes: string[];
}

export async function assessProductionBatch(repository: MemoryDataRepository, batchId: string): Promise<ProductionAssessment> {
  const batch = repository.getBatch(batchId);
  if (!batch) throw new Error("production assessment 的 batch 不存在");
  const policy = getProductionPolicySnapshot("fish-oil-production", "v1");
  const records = repository.listEvidence(batchId).filter((record) => record.kind === "production");
  const findings: ProductionFinding[] = [];
  const ordered = records
    .filter((record) => record.status === "submitted")
    .map((record) => ({ record, event: record.payload as unknown as ProductionEvent }))
    .sort((a, b) => Date.parse(a.event.startedAt) - Date.parse(b.event.startedAt));
  const seenSequences = new Map<string, string>();
  const knownOutputs = new Set([batch.batchId, batch.fillingBatchId]);
  const connectedEvidenceIds = new Set<string>();
  let previousEnd: number | undefined;
  for (const item of ordered) {
    const sequenceKey = item.event.stage + ":" + item.event.sequence;
    const previousEvidenceId = seenSequences.get(sequenceKey);
    if (previousEvidenceId) findings.push({ code: "duplicate_production_sequence", stage: item.event.stage, evidenceIds: [previousEvidenceId, item.record.evidenceId] });
    seenSequences.set(sequenceKey, item.record.evidenceId);
    const started = Date.parse(item.event.startedAt);
    if (previousEnd !== undefined && started < previousEnd) findings.push({ code: "production_time_overlap", stage: item.event.stage, evidenceIds: [item.record.evidenceId] });
    const connected = item.event.inputs.some((input) => knownOutputs.has(input.lotId));
    if (!connected) findings.push({ code: "batch_handoff_missing", stage: item.event.stage, evidenceIds: [item.record.evidenceId] });
    if (item.event.deviations.length > 0) findings.push({ code: "production_deviation_recorded", stage: item.event.stage, evidenceIds: [item.record.evidenceId] });
    if (connected) {
      connectedEvidenceIds.add(item.record.evidenceId);
      for (const output of item.event.outputs) knownOutputs.add(output.lotId);
    }
    previousEnd = Math.max(previousEnd ?? 0, Date.parse(item.event.endedAt));
  }

  const stages = PRODUCTION_STAGES.map((stage) => {
    const stageRecords = records.filter((record) => (record.payload as Partial<ProductionEvent>).stage === stage);
    const evidenceIds = stageRecords.map((record) => record.evidenceId);
    const status = stageStatus(stage, stageRecords, connectedEvidenceIds, policy);
    if (status === "missing") findings.push({ code: "missing_production_stage", stage, evidenceIds });
    if (status === "restricted") findings.push({ code: "restricted_production_evidence", stage, evidenceIds });
    if (status === "not_covered") findings.push({ code: "production_stage_not_covered", stage, evidenceIds });
    return { stage, required: policy.requiredStages.includes(stage), status, evidenceIds };
  });

  const requiredIncomplete = stages.some((stage) => stage.required && (stage.status === "missing" || stage.status === "not_covered"));
  const restricted = stages.some((stage) => stage.required && stage.status === "restricted");
  const status: ProductionAssessmentStatus = requiredIncomplete ? "incomplete" : restricted ? "review" : findings.length > 0 ? "nonconformant" : "conformant";
  return {
    schemaVersion: "production.assessment.v1",
    batchId,
    status,
    policyId: policy.policyId,
    policyVersion: policy.version,
    stages,
    findings,
    missingEvidenceCodes: stages.flatMap((stage) => stage.status === "missing" ? ["stage_missing:" + stage.stage] : stage.status === "not_covered" ? ["stage_not_covered:" + stage.stage] : stage.status === "restricted" ? ["stage_restricted:" + stage.stage] : []),
  };
}

function stageStatus(stage: ProductionStage, records: Array<{ evidenceId: string; status: string }>, connectedEvidenceIds: Set<string>, policy: ProductionPolicySnapshot): ProductionCoverageStatus {
  if (records.some((record) => record.status === "revoked")) return "restricted";
  if (records.length === 0) return policy.requiredStages.includes(stage) ? "missing" : "not_covered";
  return records.some((record) => connectedEvidenceIds.has(record.evidenceId)) ? "observed" : "not_covered";
}
