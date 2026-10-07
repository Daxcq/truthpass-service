import type { EvidenceKind } from "../data/model.js";
import { canonicalJson } from "../data/canonical.js";
import type { JevRoleView } from "../jev/model.js";
import { getPolicySnapshot, type PolicySnapshot } from "../rules/policy.js";

export type AgentRole = "production" | "inspection" | "consumer_feedback";
export type PurchaseBinding = "registered_only" | "unverified";

export interface ConsumerFeedbackInput {
  feedbackId: string;
  batchId: string;
  rating: number;
  categories: string[];
  evidenceHash: string;
  purchaseBinding: PurchaseBinding;
}

interface AgentInputBase { schemaVersion: "agent.input.v1"; role: AgentRole; view: JevRoleView; }
export interface ProductionAgentInput extends AgentInputBase { role: "production"; }
export interface InspectionAgentInput extends AgentInputBase { role: "inspection"; policy: PolicySnapshot; }
export interface ConsumerFeedbackAgentInput extends AgentInputBase { role: "consumer_feedback"; feedbacks: ConsumerFeedbackInput[]; }
export type AgentInput = ProductionAgentInput | InspectionAgentInput | ConsumerFeedbackAgentInput;

export interface AgentFinding { code: string; summary: string; sourceIds: string[]; }
interface AgentOutputBase { schemaVersion: "agent.output.v1"; batchId: string; }
export interface ProductionAgentOutput extends AgentOutputBase { role: "production"; findings: AgentFinding[]; }
export interface InspectionAgentOutput extends AgentOutputBase { role: "inspection"; findings: AgentFinding[]; }
export interface ConsumerFeedbackAgentOutput extends AgentOutputBase { role: "consumer_feedback"; themes: AgentFinding[]; anomalies: AgentFinding[]; }
export type AgentOutput = ProductionAgentOutput | InspectionAgentOutput | ConsumerFeedbackAgentOutput;

const roleEvidenceKinds: Record<AgentRole, EvidenceKind[]> = {
  production: ["production"],
  inspection: ["inspection", "cold_chain", "shipment"],
  consumer_feedback: ["production", "inspection", "cold_chain", "shipment", "purchase", "consumer_feedback"],
};

export class AgentContractError extends Error {
  constructor(readonly path: string, message: string) { super(path + ": " + message); }
}

export function parseAgentInput(role: AgentRole, value: unknown): AgentInput {
  const input = objectAt(value, "input");
  const keys = role === "production" ? ["schemaVersion", "role", "view"] : role === "inspection" ? ["schemaVersion", "role", "view", "policy"] : ["schemaVersion", "role", "view", "feedbacks"];
  exactKeys(input, keys, "input");
  literal(input.schemaVersion, "agent.input.v1", "input.schemaVersion");
  literal(input.role, role, "input.role");

  const view = objectAt(input.view, "input.view");
  literal(view.schemaVersion, "jev.view.v1", "input.view.schemaVersion");
  literal(view.role, role, "input.view.role");
  const expectedKinds = roleEvidenceKinds[role];
  const viewKinds = stringArray(view.allowedEvidenceKinds, "input.view.allowedEvidenceKinds");
  if (!sameSet(viewKinds, expectedKinds)) fail("input.view.allowedEvidenceKinds", "与角色允许的证据类型不一致");

  const context = objectAt(view.context, "input.view.context");
  literal(context.schemaVersion, "jev.context.v1", "input.view.context.schemaVersion");
  const batch = objectAt(context.batch, "input.view.context.batch");
  const batchId = stringAt(batch.batchId, "input.view.context.batch.batchId");
  if (!Array.isArray(context.evidence)) fail("input.view.context.evidence", "必须是数组");
  for (const [index, item] of context.evidence.entries()) {
    const path = "input.view.context.evidence[" + index + "]";
    const evidence = objectAt(item, path);
    stringAt(evidence.evidenceId, path + ".evidenceId");
    literal(evidence.batchId, batchId, path + ".batchId");
    if (!expectedKinds.includes(evidence.kind as EvidenceKind)) fail(path + ".kind", "角色无权接收此证据类型");
  }

  if (role === "production") return { schemaVersion: "agent.input.v1", role, view: input.view as JevRoleView };
  if (role === "inspection") {
    const policy = objectAt(input.policy, "input.policy") as unknown as PolicySnapshot;
    let approved: PolicySnapshot;
    try { approved = getPolicySnapshot(policy.policyId, policy.version); }
    catch { return fail("input.policy", "不是已批准的 PolicySnapshot"); }
    if (canonicalJson(policy) !== canonicalJson(approved)) fail("input.policy", "内容与已批准快照不一致");
    return { schemaVersion: "agent.input.v1", role, view: input.view as JevRoleView, policy: approved };
  }

  if (!Array.isArray(input.feedbacks)) fail("input.feedbacks", "必须是数组");
  const feedbacks = input.feedbacks.map((raw, index): ConsumerFeedbackInput => {
    const path = "input.feedbacks[" + index + "]";
    const feedback = objectAt(raw, path);
    exactKeys(feedback, ["feedbackId", "batchId", "rating", "categories", "evidenceHash", "purchaseBinding"], path);
    const feedbackBatchId = stringAt(feedback.batchId, path + ".batchId");
    if (feedbackBatchId !== batchId) fail(path + ".batchId", "反馈与当前批次不匹配");
    if (typeof feedback.rating !== "number" || !Number.isFinite(feedback.rating) || feedback.rating < 1 || feedback.rating > 5) fail(path + ".rating", "必须是 1 到 5 的有限数字");
    if (feedback.purchaseBinding !== "registered_only" && feedback.purchaseBinding !== "unverified") fail(path + ".purchaseBinding", "只能是 registered_only 或 unverified");
    return { feedbackId: stringAt(feedback.feedbackId, path + ".feedbackId"), batchId: feedbackBatchId, rating: feedback.rating, categories: stringArray(feedback.categories, path + ".categories"), evidenceHash: stringAt(feedback.evidenceHash, path + ".evidenceHash"), purchaseBinding: feedback.purchaseBinding };
  });
  return { schemaVersion: "agent.input.v1", role, view: input.view as JevRoleView, feedbacks };
}

export function parseAgentOutput(role: AgentRole, inputValue: unknown, value: unknown): AgentOutput {
  const input = parseAgentInput(role, inputValue);
  const output = objectAt(value, "output");
  const keys = role === "consumer_feedback" ? ["schemaVersion", "role", "batchId", "themes", "anomalies"] : ["schemaVersion", "role", "batchId", "findings"];
  exactKeys(output, keys, "output");
  literal(output.schemaVersion, "agent.output.v1", "output.schemaVersion");
  literal(output.role, role, "output.role");
  const batchId = input.view.context.batch.batchId;
  literal(output.batchId, batchId, "output.batchId");
  const allowedSourceIds = new Set(input.view.context.evidence.map((item) => item.evidenceId));

  if (role === "consumer_feedback") {
    const consumerInput = input as ConsumerFeedbackAgentInput;
    for (const feedback of consumerInput.feedbacks) allowedSourceIds.add(feedback.feedbackId);
    return { schemaVersion: "agent.output.v1", role, batchId, themes: parseFindings(output.themes, allowedSourceIds, "output.themes"), anomalies: parseFindings(output.anomalies, allowedSourceIds, "output.anomalies") };
  }

  const findings = parseFindings(output.findings, allowedSourceIds, "output.findings");
  return { schemaVersion: "agent.output.v1", role, batchId, findings };
}

function parseFindings(value: unknown, allowedIds: Set<string>, path: string): AgentFinding[] {
  if (!Array.isArray(value) || value.length > 30) fail(path, "必须是最多 30 项的数组");
  return value.map((raw, index) => {
    const itemPath = path + "[" + index + "]";
    const item = objectAt(raw, itemPath);
    exactKeys(item, ["code", "summary", "sourceIds"], itemPath);
    const code = stringAt(item.code, itemPath + ".code");
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(code)) fail(itemPath + ".code", "格式无效");
    const summary = stringAt(item.summary, itemPath + ".summary");
    if (summary.length > 500) fail(itemPath + ".summary", "最多 500 字符");
    const sourceIds = stringArray(item.sourceIds, itemPath + ".sourceIds");
    if (sourceIds.length === 0) fail(itemPath + ".sourceIds", "每条 Agent 发现必须引用至少一个来源 ID");
    if (sourceIds.some((id) => !allowedIds.has(id))) fail(itemPath + ".sourceIds", "包含输入中不存在的证据/反馈 ID");
    return { code, summary, sourceIds };
  });
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "必须是对象");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: string[], path: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) fail(path, "包含未定义字段: " + extras.join(", "));
}
function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(path, "必须是非空字符串");
  return value;
}
function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length > 100) fail(path, "必须是最多 100 项的数组");
  return value.map((item, index) => stringAt(item, path + "[" + index + "]"));
}
function literal(value: unknown, expected: string, path: string): void {
  if (value !== expected) fail(path, "必须等于 " + expected);
}
function sameSet(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}
function fail(path: string, message: string): never { throw new AgentContractError(path, message); }
