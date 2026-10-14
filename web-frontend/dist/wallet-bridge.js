(function () {
  "use strict";

  const BATCH_ID = "FO-2026-001";
  const root = document.createElement("section");
  root.id = "truthpass-wallet-bridge";
  root.innerHTML = `
    <div class="tp-wallet-head"><strong>TruthPass 钱包</strong><span id="tp-wallet-network">未连接</span></div>
    <div id="tp-wallet-account" class="tp-wallet-account">连接你的 EVM 钱包参与验证</div>
    <div class="tp-wallet-actions">
      <button id="tp-wallet-connect" type="button">Connect Wallet</button>
      <button id="tp-wallet-purchase" type="button" disabled>确认购买</button>
      <button id="tp-wallet-contribution" type="button" disabled>提交反馈</button>
      <button id="tp-wallet-dispute" type="button" disabled>提出质疑</button>
    </div>
    <div id="tp-wallet-status" class="tp-wallet-status" role="status"></div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #truthpass-wallet-bridge{position:fixed;z-index:1000;right:24px;bottom:24px;width:min(360px,calc(100vw - 32px));padding:16px;border:1px solid rgba(123,231,219,.35);border-radius:18px;background:rgba(5,20,31,.94);box-shadow:0 18px 60px rgba(0,0,0,.34);color:#e8fffb;font:14px/1.5 Inter,system-ui,sans-serif;backdrop-filter:blur(18px)}
    #truthpass-wallet-bridge .tp-wallet-head{display:flex;justify-content:space-between;gap:12px;align-items:center;color:#8feee1}
    #truthpass-wallet-bridge .tp-wallet-head span{font-size:12px;color:#b0cbd0}
    #truthpass-wallet-bridge .tp-wallet-account{margin:8px 0;color:#b7d4d7;font-size:12px;word-break:break-all}
    #truthpass-wallet-bridge .tp-wallet-actions{display:flex;flex-wrap:wrap;gap:8px}
    #truthpass-wallet-bridge button{border:1px solid rgba(123,231,219,.42);border-radius:10px;padding:8px 10px;background:#123c4a;color:#e8fffb;cursor:pointer;font:inherit;font-size:12px}
    #truthpass-wallet-bridge button:disabled{opacity:.42;cursor:not-allowed}
    #truthpass-wallet-bridge .tp-wallet-status{margin-top:10px;color:#9de8ff;font-size:12px;min-height:18px}
    @media (max-width:700px){#truthpass-wallet-bridge{right:16px;bottom:16px}}
  `;
  document.head.appendChild(style);
  document.body.appendChild(root);

  const $ = (id) => document.getElementById(id);
  let wallet = null;
  let purchaseId = null;
  let pending = false;

  function status(message) { $("tp-wallet-status").textContent = message; }
  function render() {
    const connected = Boolean(wallet?.connected);
    $("tp-wallet-network").textContent = connected ? `BOT Chain · ${wallet.chainIdNumber}` : "未连接";
    $("tp-wallet-account").textContent = connected ? `${wallet.provider} · ${wallet.account}` : "连接你的 EVM 钱包参与验证";
    $("tp-wallet-connect").textContent = connected ? "钱包已连接" : "Connect Wallet";
    $("tp-wallet-connect").disabled = pending;
    $("tp-wallet-purchase").disabled = !connected || pending;
    $("tp-wallet-contribution").disabled = !connected || !purchaseId || pending;
    $("tp-wallet-dispute").disabled = !connected || pending;
  }

  async function connect() {
    try {
      wallet = await window.TruthPassWallet.connect();
      render();
      status("已切换到 BOT Chain Mainnet，Chain ID 677");
    } catch (error) { status(error instanceof Error ? error.message : "钱包连接失败"); }
  }

  async function transact(action) {
    if (pending) { status("已有一笔钱包请求等待处理，请先在 MetaMask 中完成或拒绝"); return; }
    pending = true;
    render();
    try {
      if (!wallet?.connected) await connect();
      if (!wallet?.connected) return;
      if (action === "contribution" && !purchaseId) { status("请先完成购买登记"); return; }
      const body = { action, wallet: wallet.account, batchId: BATCH_ID, clientNonce: `${action}-${crypto.randomUUID?.() ?? Date.now()}` };
      if (purchaseId) body.purchaseId = purchaseId;
      if (action === "contribution") body.score = 90;
      const response = await fetch("/api/wallet/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const prepared = await response.json();
      if (!response.ok) throw new Error(prepared.message || `钱包交易准备失败 HTTP ${response.status}`);
      status("交易已准备，请在 MetaMask 中检查目标地址和 Gas");
      const result = await window.TruthPassWallet.sendPreparedTransaction(prepared.transaction, { action, target: prepared.contractAddress, anchorAddress: prepared.anchorAddress });
      if (action === "purchase") purchaseId = prepared.ids.purchaseId;
      wallet = await window.TruthPassWallet.state();
      render();
      status(`已确认：${result.txHash.slice(0, 12)}…  ${result.explorerUrl}`);
    } catch (error) { status(error instanceof Error ? error.message : "交易失败"); }
    finally { pending = false; render(); }
  }

  $("tp-wallet-connect").addEventListener("click", connect);
  $("tp-wallet-purchase").addEventListener("click", () => transact("purchase"));
  $("tp-wallet-contribution").addEventListener("click", () => transact("contribution"));
  $("tp-wallet-dispute").addEventListener("click", () => transact("dispute"));
  render();
})();
