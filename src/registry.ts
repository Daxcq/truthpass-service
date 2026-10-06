import { sha256Hex } from "./hash.js";
import { verifyExecution } from "./verifier.js";
import type {
  FeedbackRecord,
  ProbeResult,
  ServiceAdapter,
  ServiceCard,
  TaskRequest,
  VerificationResult,
} from "./types.js";

interface RegisteredService {
  card: ServiceCard;
  adapter: ServiceAdapter;
}

export interface RankedService {
  service: ServiceCard;
  probe: ProbeResult;
  verification?: VerificationResult;
  score: number;
}

export class ServiceRegistry {
  private readonly services = new Map<string, RegisteredService>();
  private readonly feedback = new Map<string, FeedbackRecord>();

  register(card: ServiceCard, adapter: ServiceAdapter): void {
    this.services.set(card.id, { card, adapter });
  }

  async evaluate(task: TaskRequest): Promise<RankedService[]> {
    const candidates = [...this.services.values()].filter(({ card }) =>
      card.kind === task.serviceKind && card.capabilities.includes(task.capability),
    );

    const ranked: RankedService[] = [];
    for (const candidate of candidates) {
      const probe = await candidate.adapter.probe(task);
      let verification: VerificationResult | undefined;
      if (probe.status !== "offline" && probe.capabilityMatch && probe.schemaValid) {
        verification = await verifyExecution(task, await candidate.adapter.execute(task));
      }

      const liveScore = probe.status === "healthy" ? 100 : probe.status === "degraded" ? 55 : 0;
      const acceptanceScore = verification?.score ?? 0;
      const score = Math.round(
        candidate.card.historicalScore * 0.25 + liveScore * 0.2 + acceptanceScore * 0.55,
      );
      ranked.push({ service: candidate.card, probe, verification, score });
    }

    return ranked.sort((a, b) => b.score - a.score);
  }

  async recordFeedback(
    serviceId: string,
    task: TaskRequest,
    result: VerificationResult,
    createdAt = new Date().toISOString(),
  ): Promise<FeedbackRecord> {
    const feedbackId = await sha256Hex(`${serviceId}:${task.taskId}:${result.evidenceHash}`);
    const record: FeedbackRecord = {
      feedbackId,
      serviceId,
      taskId: task.taskId,
      accepted: result.status === "accepted",
      score: result.score,
      evidenceHash: result.evidenceHash,
      createdAt,
      revoked: false,
    };
    this.feedback.set(feedbackId, record);
    return record;
  }

  listFeedback(serviceId?: string): FeedbackRecord[] {
    return [...this.feedback.values()].filter((item) => !serviceId || item.serviceId === serviceId);
  }
}
