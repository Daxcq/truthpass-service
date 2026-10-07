export type ServiceKind = "supplier" | "lab" | "logistics" | "after-sales";
export type ProbeStatus = "healthy" | "degraded" | "offline";
export type ServiceExecutionStatus = "accepted" | "rejected";
export type ProductAssessmentStatus = "accepted" | "rejected" | "not_evaluated";

export interface ServiceCard {
  id: string;
  name: string;
  kind: ServiceKind;
  endpoint: string;
  capabilities: string[];
  signer: string;
  historicalScore: number;
  feedbackCount: number;
}

export interface TaskRequest {
  taskId: string;
  serviceKind: ServiceKind;
  capability: string;
  batchId: string;
  productionTime: string;
  acceptance: {
    requireSignature: boolean;
    policyId: string;
    policyVersion: string;
  };
}

export interface ProbeResult {
  serviceId: string;
  status: ProbeStatus;
  latencyMs: number;
  capabilityMatch: boolean;
  schemaValid: boolean;
  checkedAt: string;
  reason?: string;
}

export interface ExecutionEvidence {
  serviceId: string;
  taskId: string;
  batchId: string;
  reportBatchId: string;
  productionTime: string;
  reportTime: string;
  logisticsGapHours: number;
  signatureValid: boolean;
  /** Fish-oil metrics are optional so the generic service layer remains reusable. */
  epaDhaPercent?: number;
  peroxideValue?: number;
  totox?: number;
  coldChainGapHours?: number;
  payload: Record<string, unknown>;
}

export interface ServiceExecutionResult {
  status: ServiceExecutionStatus;
  score: number;
  checks: Record<string, boolean>;
  reasons: string[];
  evidenceHash: string;
}

export interface ProductBatchAssessment {
  status: ProductAssessmentStatus;
  policyId: string;
  policyVersion: string;
  score: number;
  checks: Record<string, boolean>;
  reasons: string[];
  evidenceHash: string;
}

export interface FeedbackRecord {
  feedbackId: string;
  serviceId: string;
  taskId: string;
  accepted: boolean;
  score: number;
  evidenceHash: string;
  createdAt: string;
  revoked: boolean;
}

export interface ServiceAdapter {
  probe(task: TaskRequest): Promise<ProbeResult>;
  execute(task: TaskRequest): Promise<ExecutionEvidence>;
}

