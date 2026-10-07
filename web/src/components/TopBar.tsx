export function TopBar() {
  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-mark" src="/assets/brand-mark.png" alt="真验" width="52" height="52" />
        <span className="brand-zh">真验</span>
        <span className="brand-en">Zhenyan</span>
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
    </header>
  );
}
