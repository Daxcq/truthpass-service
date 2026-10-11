(function () {
  "use strict";

  const BOT_CHAIN = {
    chainId: "0x2a5",
    chainName: "BOT Chain Mainnet",
    rpcUrls: ["https://rpc.botchain.ai"],
    blockExplorerUrls: ["https://scan.botchain.ai"],
    nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  };

  let activeProvider = null;
  let activeProviderName = "unknown";
  let activeAccount = null;

  function providers() {
    const injected = window.ethereum;
    if (!injected) return [];
    const candidates = Array.isArray(injected.providers) ? injected.providers : [injected];
    return candidates.filter(Boolean);
  }

  function providerName(provider) {
    if (provider.isOKXWallet || provider.isOKExWallet) return "OKX Wallet";
    if (provider.isBinance) return "Binance Wallet";
    if (provider.isMetaMask) return "MetaMask";
    return "EVM Wallet";
  }

  function selectProvider(preferred) {
    const candidates = providers();
    if (candidates.length === 0) throw new Error("未检测到 MetaMask、OKX 或 Binance 钱包");
    if (!preferred) return candidates[0];
    return candidates.find((candidate) => providerName(candidate) === preferred) ?? candidates[0];
  }

  async function request(method, params) {
    if (!activeProvider) throw new Error("请先连接钱包");
    return activeProvider.request({ method, params });
  }

  async function ensureBotChain() {
    const current = await request("eth_chainId");
    if (String(current).toLowerCase() === BOT_CHAIN.chainId) return;
    try {
      await request("wallet_switchEthereumChain", [{ chainId: BOT_CHAIN.chainId }]);
    } catch (error) {
      if (error && typeof error === "object" && error.code === 4902) {
        await request("wallet_addEthereumChain", [BOT_CHAIN]);
      } else {
        throw error;
      }
    }
    const switched = await request("eth_chainId");
    if (String(switched).toLowerCase() !== BOT_CHAIN.chainId) {
      throw new Error("钱包没有切换到 BOT Chain Mainnet（Chain ID 677）");
    }
  }

  async function connect(preferred) {
    activeProvider = selectProvider(preferred);
    activeProviderName = providerName(activeProvider);
    const accounts = await request("eth_requestAccounts");
    activeAccount = Array.isArray(accounts) && accounts[0] ? accounts[0] : null;
    if (!activeAccount) throw new Error("钱包没有返回账户");
    await ensureBotChain();
    return state();
  }

  async function state() {
    if (!activeProvider || !activeAccount) return { connected: false };
    const chainId = await request("eth_chainId");
    const balance = await request("eth_getBalance", [activeAccount, "latest"]);
    return {
      connected: true,
      account: activeAccount,
      provider: activeProviderName,
      chainId,
      chainIdNumber: Number.parseInt(String(chainId).replace(/^0x/, ""), 16),
      balanceWei: balance,
    };
  }

  async function waitForReceipt(txHash, timeoutMs = 120000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const receipt = await request("eth_getTransactionReceipt", [txHash]);
      if (receipt) {
        if (receipt.status === "0x0") throw new Error(`交易已回滚：${txHash}`);
        return receipt;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }
    throw new Error(`等待交易 receipt 超时：${txHash}`);
  }

  async function sendPreparedTransaction(transaction) {
    await ensureBotChain();
    const txHash = await request("eth_sendTransaction", [{
      from: activeAccount,
      to: transaction.to,
      data: transaction.data,
      value: transaction.value ?? "0x0",
    }]);
    const receipt = await waitForReceipt(txHash);
    return { txHash, receipt, explorerUrl: explorerTx(txHash) };
  }

  async function signTypedData(typedData) {
    return request("eth_signTypedData_v4", [activeAccount, JSON.stringify(typedData)]);
  }

  function explorerTx(txHash) {
    return `https://scan.botchain.ai/tx/${txHash}`;
  }

  function on(eventName, listener) {
    if (activeProvider && typeof activeProvider.on === "function") activeProvider.on(eventName, listener);
  }

  window.TruthPassWallet = {
    BOT_CHAIN,
    providers,
    providerName,
    connect,
    state,
    sendPreparedTransaction,
    signTypedData,
    explorerTx,
    on,
  };
})();
