import type { BatchRecord, NewEvidenceRecord, ProductRecord } from "./model.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const validDate = (value: unknown): value is string => nonEmpty(value) && !Number.isNaN(Date.parse(value));

export function validateProduct(value: unknown): ValidationResult {
  const product = value as Partial<ProductRecord>;
  const errors: string[] = [];
  if (product.schemaVersion !== "product.v1") errors.push("schemaVersion 必须为 product.v1");
  if (!nonEmpty(product.productId)) errors.push("productId 不能为空");
  if (!nonEmpty(product.name)) errors.push("name 不能为空");
  if (product.category !== "fish-oil") errors.push("category 必须为 fish-oil");
  if (!nonEmpty(product.supplierId)) errors.push("supplierId 不能为空");
  if (!Array.isArray(product.claims) || product.claims.some((claim) => !nonEmpty(claim))) errors.push("claims 必须是非空字符串数组");
  if (product.dataMode !== "demo/synthetic" && product.dataMode !== "external") errors.push("dataMode 不合法");
  return { ok: errors.length === 0, errors };
}

export function validateBatch(value: unknown): ValidationResult {
  const batch = value as Partial<BatchRecord>;
  const errors: string[] = [];
  if (batch.schemaVersion !== "batch.v1") errors.push("schemaVersion 必须为 batch.v1");
  if (!nonEmpty(batch.batchId)) errors.push("batchId 不能为空");
  if (!nonEmpty(batch.productId)) errors.push("productId 不能为空");
  if (!nonEmpty(batch.supplierId)) errors.push("supplierId 不能为空");
  if (!validDate(batch.productionAt)) errors.push("productionAt 必须是有效时间");
  if (!nonEmpty(batch.fillingBatchId)) errors.push("fillingBatchId 不能为空");
  if (batch.dataMode !== "demo/synthetic" && batch.dataMode !== "external") errors.push("dataMode 不合法");
  return { ok: errors.length === 0, errors };
}

export function validateEvidence(value: unknown): ValidationResult {
  const evidence = value as Partial<NewEvidenceRecord>;
  const errors: string[] = [];
  if (evidence.schemaVersion !== "evidence.v1") errors.push("schemaVersion 必须为 evidence.v1");
  if (!nonEmpty(evidence.evidenceId)) errors.push("evidenceId 不能为空");
  if (!nonEmpty(evidence.batchId)) errors.push("batchId 不能为空");
  if (!["production", "inspection", "cold_chain", "shipment", "purchase", "consumer_feedback"].includes(evidence.kind ?? "")) errors.push("kind 不合法");
  if (!nonEmpty(evidence.issuerId)) errors.push("issuerId 不能为空");
  if (!["manufacturer", "third_party", "platform_device", "consumer"].includes(evidence.sourceKind ?? "")) errors.push("sourceKind 不合法");
  if (!validDate(evidence.occurredAt)) errors.push("occurredAt 必须是有效时间");
  if (!evidence.payload || typeof evidence.payload !== "object" || Array.isArray(evidence.payload)) errors.push("payload 必须是对象");
  if (evidence.dataMode !== "demo/synthetic" && evidence.dataMode !== "external") errors.push("dataMode 不合法");
  return { ok: errors.length === 0, errors };
}
