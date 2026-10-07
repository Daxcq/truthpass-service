// 与后端 examples/*.json 及 src/types.ts 对齐的前端视图模型。

export interface KeyMetric {
  key: string;
  icon: string;
  label: string;
  value: string;
  unit: string;
  status: "pass" | "missing";
}

export interface ProductBatch {
  batchId: string;
  name: string;
  category: string;
  origin: string;
  productionDate: string;
  supplyChainTags: string[];
  imageUrl: string;
  verification: {
    status: "accepted" | "partial" | "rejected";
    summary: string;
    scope: string;
  };
  keyMetrics: KeyMetric[];
}

export interface EvidenceStep {
  step: number;
  icon: string;
  title: string;
  source: string;
  description: string;
  hash: string;
  verifiedAt: string;
}

export interface JourneyStep {
  step: number;
  title: string;
  description: string;
  hash: string;
}

export interface Journey {
  batchId: string;
  status: string;
  steps: JourneyStep[];
}

export interface MetricSource {
  name: string;
  method: string;
  reportNo: string;
  pdf: string;
  time: string;
  signature: string;
}

export interface MetricDetail {
  label: string;
  value: string;
  unit: string;
  threshold: string;
  sources: MetricSource[];
}

export type ChatLineClass =
  | "cmd"
  | "plain"
  | "check"
  | "lead"
  | "conclusion"
  | "disclaimer";

export interface ChatEvent {
  kind: "begin" | "line" | "done";
  cls?: ChatLineClass;
  text?: string;
}

export interface ChatLine {
  cls: ChatLineClass;
  text: string;
}
