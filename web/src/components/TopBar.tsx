export function TopBar({ onOpenObserver }: { onOpenObserver: () => void }) {
  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-mark" src="/assets/brand-mark.png" alt="TruthPass" width="52" height="52" />
        <span className="brand-zh">TruthPass</span>
      </div>
      <span className="brand-tagline">看见真实的供应链 · 让好产品被信任</span>
      <nav className="nav" aria-label="主导航">
        <a href="#hero">探索</a>
        <a href="#product">产品</a>
        <a href="#evidence">证据</a>
        <a href="#community">消费者共建</a>
        <a href="#about">关于</a>
      </nav>
      <span className="chip">DEMO / SYNTHETIC</span>
      <button className="ghost-button" type="button" onClick={onOpenObserver}>
        评委观察台
      </button>
    </header>
  );
}
