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

export const fetchProduct = () => getJson<ProductBatch>(`/api/products/${BATCH_ID}`);
export const fetchEvidenceLink = () => getJson<EvidenceStep[]>(`/api/products/${BATCH_ID}/evidence-link`);
export const fetchJourney = () => getJson<Journey>(`/api/products/${BATCH_ID}/journey`);
export const fetchMetricDetail = (key: string) =>
  getJson<MetricDetail>(`/api/products/${BATCH_ID}/metrics/${key}`);

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
