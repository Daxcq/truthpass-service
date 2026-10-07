import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEvidenceLink, fetchJourney } from "../api";
import { ICON_URLS } from "../data";
import { useModal } from "./ModalContext";

function formatTime(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

function JourneyModal() {
  const { data, isLoading } = useQuery({ queryKey: ["journey"], queryFn: fetchJourney });
  if (isLoading) return <p style={{ color: "var(--muted)" }}>加载中…</p>;
  return (
    <>
      {data?.steps.map((s) => (
        <div className="journey-step" key={s.step}>
          <div className="journey-num">{s.step}</div>
          <div>
            <h4>{s.title}</h4>
            <p>{s.description}</p>
            <div className="journey-hash">{s.hash}</div>
          </div>
        </div>
      ))}
      <p className="rule-verdict">总体验证状态：{data?.status} ✓</p>
    </>
  );
}

export function EvidencePanel() {
  const { data: steps, isLoading } = useQuery({ queryKey: ["evidence"], queryFn: fetchEvidenceLink });
  const [expanded, setExpanded] = useState(false);
  const { openModal } = useModal();

  return (
    <aside id="evidence" className={`panel evidence-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-head">
        <span className="panel-title">证据链路</span>
        <button
          className="expand-chip"
          type="button"
          aria-expanded={expanded}
          aria-controls="evidence-steps"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="expand-label">{expanded ? "收起全部" : "展开全部"}</span>
          <span className="expand-chev" aria-hidden="true">
            ›
          </span>
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: "flex", gap: 12 }}>
              <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 12, flex: "none" }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ width: "40%", height: 15 }} />
                <div className="skeleton" style={{ width: "90%", height: 12, marginTop: 8 }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <ol className="evidence-steps">
            {(steps ?? []).map((s) => (
              <li className="evidence-step" key={s.step}>
                <span className="evidence-dot">
                  <img src={ICON_URLS[s.icon]} alt="" />
                  <em>{s.step}</em>
                </span>
                <h3>{s.title}</h3>
                <p>{s.description}</p>
                <div className="evidence-detail">
                  <div className="evidence-detail-inner">
                    <div className="evidence-meta">
                      <span>来源</span>
                      <b>{s.source}</b>
                    </div>
                    <div className="evidence-meta">
                      <span>时间</span>
                      <b>{formatTime(s.verifiedAt)}</b>
                    </div>
                    <div className="evidence-meta">
                      <span>哈希</span>
                      <b className="hash">{s.hash}</b>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="evidence-echo">
            {(steps ?? []).map((s) => (
              <span key={s.step}>{s.title}</span>
            ))}
          </div>
        </>
      )}

      <button className="cta-btn" type="button" onClick={() => openModal("完整证据链（6 步）", <JourneyModal />)}>
        查看完整证据链 →
      </button>
    </aside>
  );
}
