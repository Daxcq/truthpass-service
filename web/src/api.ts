import type {
  ChatEvent,
  EvidenceStep,
  Journey,
  MetricDetail,
  ProductBatch,
} from "./types";

export const BATCH_ID = "FO-2026-001";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const fetchProduct = (batchId: string) => getJson<ProductBatch>(`/api/products/${batchId}`);
export const fetchEvidenceLink = (batchId: string) => getJson<EvidenceStep[]>(`/api/products/${batchId}/evidence-link`);
export const fetchJourney = (batchId: string) => getJson<Journey>(`/api/products/${batchId}/journey`);
export const fetchMetricDetail = (batchId: string, key: string) =>
  getJson<MetricDetail>(`/api/products/${batchId}/metrics/${key}`);

export async function postChat(
  question: string,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batchId: BATCH_ID, messages: [{ role: "user", content: question }] }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("stream unavailable");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      onEvent(JSON.parse(line.slice(5).trim()) as ChatEvent);
    }
  }
}

export interface ObserverServiceView {
  id: string;
  history: number;
  live: "degraded" | "offline" | "online";
  verdict: "rejected" | "not-called" | "passed";
}

export interface ObserverData {
  task: string;
  policy: string;
  jev: string;
  evidenceRoot: string;
  chainStatus: string;
  services: ObserverServiceView[];
}

export const fetchObserver = () => getJson<ObserverData>("/api/observer");

export async function postFeedback(
  rating: number,
  categories: string[],
  comment?: string,
): Promise<{ ok: boolean; contributionPoints: number; evidenceHash: string }> {
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating, categories, comment }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as { ok: boolean; contributionPoints: number; evidenceHash: string };
}

export interface VerificationRule {
  name: string;
  desc: string;
  passed: boolean;
}

export interface VerificationEvidence {
  evidenceId: string;
  kind: string;
  issuerId: string;
  sourceKind: string;
  payloadHash: string;
  status: string;
  occurredAt: string;
}

export interface VerificationData {
  batchId: string;
  productName: string;
  policy: { id: string; version: string; dataMode: string };
  status: string;
  score: number;
  evidenceHash: string;
  serviceExecution: { status: string; score: number; evidenceHash: string };
  rules: VerificationRule[];
  evidence: VerificationEvidence[];
}

export const fetchVerification = (batchId: string) => getJson<VerificationData>(`/api/verification?batchId=${batchId}`);
