import { useEffect, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMetricDetail, fetchProduct } from "../api";
import { ICON_URLS, METRIC_BAR_PCT, RULES } from "../data";
import { useCountUp } from "../hooks/useCountUp";
import type { KeyMetric, MetricSource, ProductBatch, ProductionPublicSummary } from "../types";
import { useModal } from "./ModalContext";

function parseMetricValue(value: string): { num: number | null; suffix: string; decimals: number } {
  const m = value.match(/^([\d.]+)(.*)$/);
  if (!m) return { num: null, suffix: value, decimals: 0 };
  const decimals = m[1].match(/\.(\d+)/)?.[1]?.length ?? 0;
  return { num: parseFloat(m[1]), suffix: m[2], decimals };
}

function AnimatedValue({ value }: { value: string }) {
  const { num, suffix, decimals } = parseMetricValue(value);
  const animated = useCountUp(num ?? 0, 1500);
  if (num === null) return <>{value}</>;
  return (
    <>
      {animated.toFixed(decimals)}
      {suffix}
    </>
  );
}

function MetricSources({ sources }: { sources: MetricSource[] }) {
  return (
    <>
      {sources.map((s, i) => (
        <div className="source-item" key={i}>
          <b>{s.name}</b> · {s.method}
          <br />
          报告编号：{s.reportNo}
          <br />
          PDF：{s.pdf}
          <br />
          检测时间：{s.time}
          <br />
          签名：<span className="journey-hash">{s.signature}</span>
        </div>
      ))}
    </>
  );
}

function MetricDetailModal({ metricKey, label, value }: { metricKey: string; label: string; value: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["metric", metricKey],
    queryFn: () => fetchMetricDetail(metricKey),
  });
  return (
    <div>
      <p style={{ marginTop: 0 }}>
        数值：<b style={{ color: "var(--cyan-2)" }}>{data?.value ?? value}</b>
        {data && (
          <>
            {" "}· 门槛：<b style={{ color: "var(--ok)" }}>{data.threshold}</b>
          </>
        )}
      </p>
      <h4 style={{ margin: "18px 0 4px" }}>来源</h4>
      {isLoading && <p style={{ color: "var(--muted)" }}>加载中…</p>}
      {data && <MetricSources sources={data.sources} />}
      <p style={{ color: "var(--muted)", marginBottom: 0 }}>
        单位：{data?.unit ?? label}
      </p>
    </div>
  );
}

function MetricCard({ metric }: { metric: KeyMetric }) {
  const { openModal } = useModal();
  const pct = METRIC_BAR_PCT[metric.key] ?? 0;
  const warn = metric.key === "peroxide";
  const missing = metric.status === "missing";
  const [barPct, setBarPct] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setBarPct(pct), 120);
    return () => window.clearTimeout(t);
  }, [pct]);

  return (
    <div className={missing ? "metric-card missing wide" : "metric-card"}>
      <button
        className="metric-q"
        title="查看来源"
        onClick={() =>
          missing
            ? openModal(
                `${metric.label}`,
                <div>
                  <p style={{ marginTop: 0, color: "var(--warn)" }}>该检测项尚未覆盖。</p>
                  <p style={{ color: "var(--muted)" }}>
                    可继续调用独立检测服务补充报告，结果通过确定性验收后再加入证据链。
                  </p>
                </div>,
              )
            : openModal(`${metric.label} ${metric.value}`, <MetricDetailModal metricKey={metric.key} label={metric.label} value={metric.value} />)
        }
      >
        ?
      </button>
      <div className="metric-icon" aria-hidden="true">
        <img src={ICON_URLS[metric.icon]} alt="" />
      </div>
      <div className="metric-label">{metric.label}</div>
      <div className={missing ? "metric-value missing" : warn ? "metric-value warn" : "metric-value"}>
        <AnimatedValue value={metric.value} />
      </div>
      <div className="metric-bar">
        <span className="metric-bar-fill" style={{ width: `${barPct}%` } as CSSProperties} />
      </div>
      <div className="metric-unit">{metric.unit}</div>
    </div>
  );
}

function RulesView() {
  return (
    <>
      {RULES.map((rule) => (
        <div className="rule-row" key={rule.name}>
          <span className="mark">✓</span>
          <span className="rule-name">{rule.name}</span>
          <span className="rule-desc">{rule.desc}</span>
        </div>
      ))}
      <p className="rule-verdict">综合：按当前规则通过（accepted）</p>
    </>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  manufacturer: "厂家自报",
  third_party: "第三方记录",
  platform_device: "平台设备",
  consumer: "消费者反馈",
};

const PROCESS_STATUS_LABELS: Record<ProductionPublicSummary["status"], string> = {
  conformant: "过程记录完整",
  nonconformant: "存在记录异常",
  incomplete: "过程记录未完整",
  review: "过程记录需复核",
};

function ProductionProcess({ process }: { process: ProductionPublicSummary }) {
  return (
    <section className="production-process" aria-label="生产过程公开">
      <div className="production-process-head">
        <div><span className="eyebrow">生产过程公开</span><strong>{PROCESS_STATUS_LABELS[process.status]}</strong></div>
        <span className="production-process-count">已记录 {process.observedStageCount}/{process.requiredStageCount} 道工序</span>
      </div>
      <div className="production-facts">
        {process.originRegion && <div><span>原料来源</span><strong>{process.originRegion}</strong></div>}
        {process.facts.map((fact) => <div key={fact.label + fact.value}><span>{fact.label}</span><strong>{fact.value}</strong></div>)}
      </div>
      <div className="production-stages">
        {process.stages.map((stage) => <span key={stage.stage} className={"production-stage " + stage.status}>{stage.label} · {stage.status === "observed" ? "已记录" : stage.status === "restricted" ? "受限" : stage.status === "missing" ? "缺失" : "未覆盖"}</span>)}
      </div>
      {process.missingStages.length > 0 && <p className="production-missing">尚未覆盖：{process.missingStages.join("、")}</p>}
      <p className="production-note">来源类别：{process.sourceKinds.map((kind) => SOURCE_LABELS[kind] ?? kind).join("、")} · {process.dataMode}。过程记录不等同于成品检测合格。</p>
    </section>
  );
}

export function ProductPanel() {
  const { data: product, isLoading, isError } = useQuery({ queryKey: ["product"], queryFn: fetchProduct });
  const { openModal } = useModal();
  const [tooltipVisible, setTooltipVisible] = useState(false);

  if (isLoading) {
    return (
      <section id="product" className="panel product-panel">
        <div className="product-top">
          <div className="skeleton" style={{ width: 260, height: 260, borderRadius: 16, flex: "none" }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="skeleton" style={{ width: "50%", height: 16 }} />
            <div className="skeleton" style={{ width: "72%", height: 26 }} />
            <div className="skeleton" style={{ width: "36%", height: 14 }} />
            <div className="skeleton" style={{ width: "82%", height: 14 }} />
            <div className="skeleton" style={{ width: "60%", height: 14 }} />
          </div>
        </div>
        <div className="metrics" style={{ marginTop: 20 }}>
          {[0, 1, 2].map((i) => (
            <div className="metric-card" key={i}>
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
              <div className="skeleton" style={{ width: "60%", height: 14, marginTop: 12 }} />
              <div className="skeleton" style={{ width: "40%", height: 28, marginTop: 8 }} />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (isError || !product) {
    return (
      <section id="product" className="panel product-panel">
        <p style={{ color: "var(--warn)" }}>批次数据加载失败，请确认后端服务已启动。</p>
      </section>
    );
  }

  return (
    <section id="product" className="panel product-panel">
      <div className="product-top">
        <div className="product-figure">
          <img src={product.imageUrl} alt={`${product.name} ${product.batchId}`} />
          <div className="packaging" aria-hidden="true">
            <span className="pk-brand">OMEGA-3</span>
            <span className="pk-sub">PURE OCEAN</span>
            <span className="pk-sub">FOR A BRIGHTER</span>
            <span className="pk-sub">TOMORROW</span>
          </div>
          <p className="figure-note" aria-hidden="true">
            来自深蓝
            <br />
            也让更透明的未来
          </p>
        </div>
        <div className="product-meta">
          <p className="product-kicker">深海 · 可追溯 · 更安心</p>
          <h2 className="product-name">{product.name}</h2>
          <p className="product-batch">{product.batchId}</p>
          <p className="product-tags">
            {product.supplyChainTags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </p>
          <ul className="product-facts">
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21.5S5.5 16.4 5.5 10.7a6.5 6.5 0 1 1 13 0c0 5.7-6.5 10.8-6.5 10.8z" />
                <circle cx="12" cy="10.7" r="2.4" />
              </svg>
              <span>{product.origin}</span>
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.2" y="5" width="17.6" height="15.5" rx="2.4" />
                <path d="M8 3v4.2M16 3v4.2M3.2 10.2h17.6" />
              </svg>
              <span>{product.productionDate} 生产</span>
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="8.2" />
                <path d="M12 7.6v8.8M8.2 9.8l7.6 4.4M15.8 9.8l-7.6 4.4" />
                <path d="M12 7.6L10.6 9M12 7.6l1.4 1.4M12 16.4l-1.4-1.4M12 16.4l1.4-1.4" />
              </svg>
              <span>全程冷链运输</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="verdict-wrap">
        <button
          className="verdict"
          type="button"
          onClick={() => openModal("完整验收规则（v1.0 · 9 项）", <RulesView />)}
          onMouseEnter={() => setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
        >
          <span className="verdict-icon">✓</span>
          <span className="verdict-text">
            <strong>按当前规则通过</strong>
            <small>{product.verification.summary}</small>
          </span>
          <span className="verdict-chevron">›</span>
        </button>
        {tooltipVisible && (
          <div className="verdict-tooltip" role="tooltip">
            结论依据当前 v1.0 规则生成，点“查看详细说明”可展开完整规则。
          </div>
        )}
      </div>

      <div className="metrics">
        {product.keyMetrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </div>

      <ProductionProcess process={product.productionProcess} />

      <div className="scope-bar">
        <span className="scope-label">适用范围</span>
        <span className="scope-text">通用范围：本结论适用于 {product.verification.scope}。</span>
        <button className="scope-link" type="button" onClick={() => openModal("完整验收规则（v1.0 · 9 项）", <RulesView />)}>
          查看详细说明 →
        </button>
      </div>
    </section>
  );
}
