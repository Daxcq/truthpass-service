import { OBSERVER, type ObserverService } from "../data";

const LIVE_TEXT: Record<ObserverService["live"], string> = {
  degraded: "降级",
  offline: "离线",
  online: "在线",
};
const LIVE_CLASS: Record<ObserverService["live"], string> = {
  degraded: "amber-text",
  offline: "red-text",
  online: "green-text",
};
const VERDICT_TEXT: Record<ObserverService["verdict"], string> = {
  rejected: "拒绝",
  "not-called": "未调用",
  passed: "通过",
};
const VERDICT_CLASS: Record<ObserverService["verdict"], string> = {
  rejected: "red-text",
  "not-called": "",
  passed: "green-text",
};

export function ObserverDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="observer-drawer" aria-hidden={!open}>
        <div className="drawer-head">
          <div>
            <p className="eyebrow">JUDGE OBSERVER MODE</p>
            <h2>系统观察台</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <p className="drawer-intro">网页只是同一条 CLI 验证链的可视化投影。每一步都可以回到事件、规则和哈希。</p>
        <div className="observer-row">
          <span>当前验证任务</span>
          <strong>{OBSERVER.task}</strong>
        </div>
        <div className="observer-row">
          <span>规则集</span>
          <strong>{OBSERVER.policy}</strong>
        </div>
        <div className="observer-row">
          <span>JEV 决策门</span>
          <strong>{OBSERVER.jev}</strong>
        </div>
        <div className="observer-row">
          <span>证据根哈希</span>
          <strong>{OBSERVER.evidenceRoot}</strong>
        </div>
        <div className="observer-row">
          <span>链上状态</span>
          <strong className="green-text">{OBSERVER.chainStatus}</strong>
        </div>
        <div className="service-table">
          <div className="table-head">
            <span>服务</span>
            <span>历史</span>
            <span>当前</span>
            <span>本次</span>
          </div>
          {OBSERVER.services.map((s) => (
            <div key={s.id}>
              <span>{s.id}</span>
              <span>{s.history}</span>
              <span className={LIVE_CLASS[s.live]}>{LIVE_TEXT[s.live]}</span>
              <span className={VERDICT_CLASS[s.verdict]}>{VERDICT_TEXT[s.verdict]}</span>
            </div>
          ))}
        </div>
        <div className="drawer-boundary">
          <span>边界提醒</span>
          <p>链上确认提交过的记录没有被悄悄改写；设备、实验室和生产方的现实真实性仍需要多源、复检和争议机制共同维护。</p>
        </div>
      </aside>
    </>
  );
}
