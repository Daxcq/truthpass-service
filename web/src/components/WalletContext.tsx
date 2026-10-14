import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmChainTx, fetchChainStatus, prepareWalletTx } from "../api";
import {
  BOT_CHAIN_NETWORK_PARAMS,
  discoverWalletOptions,
  ensureBotChainMainnet,
  shortHex,
  waitForTransactionReceipt,
  type Eip1193Provider,
  type WalletKind,
  type WalletOption,
} from "../lib/wallet";
import type { ChainStatusData, SessionChainTx, WalletActionKind } from "../types";

export interface WalletContextValue {
  address: string | null;
  chainId: number | null;
  walletName: string | null;
  walletKind: WalletKind | null;
  connecting: boolean;
  txBusy: boolean;
  lastTx: SessionChainTx | null;
  chainStatus: ChainStatusData | undefined;
  walletModalOpen: boolean;
  setWalletModalOpen: (open: boolean) => void;
  connectWallet: (kind: WalletKind) => Promise<string | null>;
  switchToBotChain: () => Promise<boolean>;
  disconnectWallet: () => void;
  executeOnChainAction: (params: {
    action: WalletActionKind;
    batchId: string;
    purchaseId?: string;
    points?: number;
    reason?: string;
  }) => Promise<SessionChainTx>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}

export function WalletProvider({
  children,
  activeBatchId,
  onToast,
}: {
  children: ReactNode;
  activeBatchId: string | null;
  onToast: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [walletKind, setWalletKind] = useState<WalletKind | null>(null);
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [txBusy, setTxBusy] = useState(false);
  const [lastTx, setLastTx] = useState<SessionChainTx | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [options, setOptions] = useState<WalletOption[]>(() => discoverWalletOptions());
  const [txError, setTxError] = useState<string | null>(null);

  const { data: chainStatus } = useQuery({
    queryKey: ["chain-status"],
    queryFn: fetchChainStatus,
    staleTime: 15_000,
  });

  useEffect(() => {
    const refresh = () => setOptions(discoverWalletOptions());
    refresh();
    const timer = window.setTimeout(refresh, 600);
    return () => window.clearTimeout(timer);
  }, [walletModalOpen]);

  useEffect(() => {
    if (!provider?.on) return;
    const handleAccountsChanged = (accounts: string[]) => {
      if (Array.isArray(accounts) && accounts.length > 0) {
        setAddress(accounts[0]);
      } else {
        setAddress(null);
      }
    };
    const handleChainChanged = (hex: string) => {
      const parsed = parseInt(String(hex), 16);
      if (!Number.isNaN(parsed)) setChainId(parsed);
    };
    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [provider]);

  const connectWallet = useCallback(
    async (kind: WalletKind): Promise<string | null> => {
      setTxError(null);
      const discovered = discoverWalletOptions();
      setOptions(discovered);
      const target = discovered.find((o) => o.kind === kind) ?? discovered[0];
      if (!target?.provider) {
        const msg = `未检测到 ${target?.name ?? "EVM 钱包"} 浏览器插件，请先安装或解锁钱包扩展`;
        setTxError(msg);
        onToast(msg);
        return null;
      }

      setConnecting(true);
      try {
        const accounts = (await target.provider.request({
          method: "eth_requestAccounts",
        })) as string[];
        if (!Array.isArray(accounts) || accounts.length === 0) {
          throw new Error("未获取到钱包账户授权");
        }
        const connectedAddr = accounts[0];
        setProvider(target.provider);
        setAddress(connectedAddr);
        setWalletName(target.name);
        setWalletKind(target.kind);

        try {
          const switchedChainId = await ensureBotChainMainnet(target.provider);
          setChainId(switchedChainId);
          onToast(`已连接 ${target.name} (${shortHex(connectedAddr)}) · BOT Chain Mainnet (677)`);
        } catch {
          const rawChainHex = (await target.provider.request({ method: "eth_chainId" })) as string;
          const currentChain = parseInt(rawChainHex, 16);
          setChainId(currentChain);
          onToast(`已连接 ${target.name} (${shortHex(connectedAddr)})，请切换到 BOT Chain Mainnet (677)`);
        }
        return connectedAddr;
      } catch (err: any) {
        const message = err?.message || "连接钱包被拒绝或失败";
        setTxError(message);
        onToast(`钱包连接失败：${message}`);
        return null;
      } finally {
        setConnecting(false);
      }
    },
    [onToast],
  );

  const switchToBotChain = useCallback(async (): Promise<boolean> => {
    if (!provider) {
      setWalletModalOpen(true);
      return false;
    }
    try {
      const updated = await ensureBotChainMainnet(provider);
      setChainId(updated);
      onToast("已切换至 BOT Chain Mainnet (Chain ID: 677)");
      return updated === BOT_CHAIN_NETWORK_PARAMS.chainIdDec;
    } catch (err: any) {
      const msg = err?.message || "切换网络失败";
      setTxError(msg);
      onToast(`切换 BOT Chain Mainnet 失败：${msg}`);
      return false;
    }
  }, [provider, onToast]);

  const disconnectWallet = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setWalletName(null);
    setWalletKind(null);
    setProvider(null);
    setTxError(null);
    onToast("已断开钱包连接");
  }, [onToast]);

  const executeOnChainAction = useCallback(
    async (params: {
      action: WalletActionKind;
      batchId: string;
      purchaseId?: string;
      points?: number;
      reason?: string;
    }): Promise<SessionChainTx> => {
      setTxError(null);
      let activeProvider = provider;
      let activeAddress = address;
      let activeWalletName = walletName ?? "EVM Wallet";

      if (!activeProvider || !activeAddress) {
        const discovered = discoverWalletOptions();
        const preferred = discovered.find((d) => d.detected && d.provider) ?? discovered[0];
        if (!preferred?.provider) {
          setWalletModalOpen(true);
          throw new Error("请先连接 MetaMask、OKX Wallet 或 Binance Wallet 等 EVM 钱包");
        }
        activeProvider = preferred.provider;
        activeWalletName = preferred.name;
        const accounts = (await activeProvider.request({ method: "eth_requestAccounts" })) as string[];
        if (!Array.isArray(accounts) || !accounts[0]) {
          throw new Error("未授权钱包账户");
        }
        activeAddress = accounts[0];
        setProvider(activeProvider);
        setAddress(activeAddress);
        setWalletName(preferred.name);
        setWalletKind(preferred.kind);
      }

      setTxBusy(true);
      try {
        const ensuredChainId = await ensureBotChainMainnet(activeProvider);
        setChainId(ensuredChainId);

        const prepared = await prepareWalletTx({
          action: params.action,
          batchId: params.batchId,
          wallet: activeAddress,
          purchaseId: params.purchaseId,
          points: params.points,
          reason: params.reason,
        });

        const txHash = (await activeProvider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: activeAddress,
              to: prepared.txRequest.to,
              data: prepared.txRequest.data,
              value: prepared.txRequest.value,
            },
          ],
        })) as string;

        onToast(`交易已广播至 BOT Chain Mainnet：${shortHex(txHash, 10, 6)}，正在确认区块…`);
        const receipt = await waitForTransactionReceipt(activeProvider, txHash);

        const confirmed = await confirmChainTx({
          action: params.action,
          event: prepared.event,
          batchId: params.batchId,
          wallet: activeAddress,
          providerName: activeWalletName,
          contractAddress: prepared.contractAddress,
          txHash,
          blockNumber: receipt?.blockNumber,
        });

        setLastTx(confirmed.transaction);
        void queryClient.invalidateQueries({ queryKey: ["chain-status"] });
        void queryClient.invalidateQueries({ queryKey: ["observer"] });
        onToast(`链上交易已确认 (${prepared.event}) · 区块 ${receipt?.blockNumber ?? "最新"}`);
        return confirmed.transaction;
      } catch (err: any) {
        const msg = err?.message || "链上交易签名或广播失败";
        setTxError(msg);
        onToast(`链上交互未完成：${msg}`);
        throw err;
      } finally {
        setTxBusy(false);
      }
    },
    [provider, address, walletName, onToast, queryClient],
  );

  const targetBatch = activeBatchId || "FO-2026-001";

  return (
    <WalletContext.Provider
      value={{
        address,
        chainId,
        walletName,
        walletKind,
        connecting,
        txBusy,
        lastTx,
        chainStatus,
        walletModalOpen,
        setWalletModalOpen,
        connectWallet,
        switchToBotChain,
        disconnectWallet,
        executeOnChainAction,
      }}
    >
      {children}
      {walletModalOpen && (
        <div className="modal-backdrop" onClick={() => setWalletModalOpen(false)}>
          <div className="modal-card wallet-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="wallet-modal-header">
              <div>
                <span className="wallet-eyebrow">BOT CHAIN MAINNET · CHAIN ID 677 (0x2a5)</span>
                <h3>多钱包连接与主网链上交互中心</h3>
              </div>
              <button className="close-button" type="button" onClick={() => setWalletModalOpen(false)} aria-label="关闭">
                ×
              </button>
            </div>

            <p className="wallet-modal-desc">
              支持连接 <strong>MetaMask</strong>、<strong>OKX Wallet</strong>、<strong>Binance Wallet</strong> 等 EVM 钱包，自动切换至{" "}
              <strong>BOT Chain Mainnet (Chain ID: 677)</strong> 并与主网合约进行真实交易签名交互。
            </p>

            {/* 1. 钱包选择器 */}
            <div className="wallet-section">
              <div className="wallet-section-head">
                <b>1. 选择并连接 EVM 钱包</b>
                {address ? (
                  <span className="wallet-connected-pill">
                    ● 已连接 {walletName} · {shortHex(address)} · Chain {chainId ?? "-"}
                  </span>
                ) : (
                  <span className="wallet-disconnected-pill">未连接钱包</span>
                )}
              </div>
              <div className="wallet-grid">
                {options.map((opt) => {
                  const isCurrent = address && walletKind === opt.kind;
                  return (
                    <button
                      key={opt.kind}
                      type="button"
                      className={isCurrent ? "wallet-option-btn active" : "wallet-option-btn"}
                      disabled={connecting}
                      onClick={() => connectWallet(opt.kind)}
                    >
                      <div className="wallet-option-top">
                        <strong>{opt.name}</strong>
                        <span className={opt.detected ? "wallet-badge detected" : "wallet-badge"}>
                          {isCurrent ? "当前已连接" : opt.detected ? "已检测到插件" : opt.badge}
                        </span>
                      </div>
                      <small>{opt.subtitle}</small>
                    </button>
                  );
                })}
              </div>
              {address && (
                <div className="wallet-bar-actions">
                  {chainId !== 677 && (
                    <button type="button" className="wallet-action-primary" onClick={switchToBotChain}>
                      一键切换 / 添加 BOT Chain Mainnet (Chain ID 677)
                    </button>
                  )}
                  <button type="button" className="wallet-action-ghost" onClick={disconnectWallet}>
                    断开钱包 ({shortHex(address)})
                  </button>
                </div>
              )}
            </div>

            {/* 2. 真实产品功能链上交互 */}
            <div className="wallet-section">
              <div className="wallet-section-head">
                <b>2. 真实产品功能链上交互（目标批次：{targetBatch}）</b>
                <span>合约：TruthPassConsumerGateway ({shortHex(chainStatus?.contracts.consumerGateway.address ?? "0x5192484B107E51EADFda4DBF4c9fFa41C03453F1")})</span>
              </div>
              <div className="wallet-tx-actions">
                <button
                  type="button"
                  className="wallet-tx-btn"
                  disabled={txBusy}
                  onClick={() =>
                    executeOnChainAction({ action: "purchase", batchId: targetBatch }).catch(() => undefined)
                  }
                >
                  <strong>⛓️ 链上购买凭证锚定</strong>
                  <small>调用 recordPurchase 上链存证</small>
                </button>
                <button
                  type="button"
                  className="wallet-tx-btn"
                  disabled={txBusy}
                  onClick={() =>
                    executeOnChainAction({ action: "contribution", batchId: targetBatch, points: 20 }).catch(() => undefined)
                  }
                >
                  <strong>🌟 链上共建积分铸造</strong>
                  <small>调用 recordContribution 登记 20 积分</small>
                </button>
                <button
                  type="button"
                  className="wallet-tx-btn"
                  disabled={txBusy}
                  onClick={() =>
                    executeOnChainAction({
                      action: "dispute",
                      batchId: targetBatch,
                      reason: `Consumer quality audit request for ${targetBatch}`,
                    }).catch(() => undefined)
                  }
                >
                  <strong>⚠️ 链上发起质量争议</strong>
                  <small>调用 raiseDispute 触发链上复检</small>
                </button>
              </div>

              {txError && <div className="wallet-error-box">提示：{txError}</div>}

              {lastTx && (
                <div className="wallet-receipt-box">
                  <div>
                    <strong>✓ 本次会话最新上链交易已确认 ({lastTx.event})</strong>
                    <span>
                      批次 {lastTx.batchId} · 钱包 {shortHex(lastTx.wallet)} · 交易哈希{" "}
                      <code>{shortHex(lastTx.txHash, 12, 8)}</code>
                    </span>
                  </div>
                  <a href={lastTx.explorerUrl} target="_blank" rel="noreferrer" className="explorer-link-btn">
                    在 BOT Chain 浏览器查看 ↗
                  </a>
                </div>
              )}
            </div>

            {/* 3. BOT Chain Mainnet (677) 主网已部署合约与可验证交易记录 */}
            <div className="wallet-section">
              <div className="wallet-section-head">
                <b>3. BOT Chain Mainnet (Chain ID: 677) 主网合约与交易核验</b>
                <span>
                  RPC:{" "}
                  <strong className={chainStatus?.liveRpc.reachable ? "green-text" : "amber-text"}>
                    {chainStatus?.liveRpc.reachable
                      ? `在线 · 最新区块 #${chainStatus.liveRpc.latestBlockNumber}`
                      : "https://rpc.botchain.ai"}
                  </strong>
                </span>
              </div>

              {chainStatus && (
                <>
                  <div className="mainnet-contracts-list">
                    {Object.values(chainStatus.contracts).map((c) => (
                      <div className="mainnet-contract-row" key={c.address}>
                        <div>
                          <strong>{c.name}</strong>
                          <small>{c.role}</small>
                          <code>{c.address}</code>
                        </div>
                        <div className="mainnet-links">
                          <a href={c.explorerUrl} target="_blank" rel="noreferrer">
                            合约地址 ↗
                          </a>
                          <a href={c.deployTxUrl} target="_blank" rel="noreferrer">
                            部署交易 (#{c.blockNumber}) ↗
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mainnet-tx-list">
                    <div className="mainnet-tx-title">已验证的主网业务交易记录 (scan.botchain.ai)</div>
                    {(chainStatus.sessionTransactions.length > 0
                      ? [
                          ...chainStatus.sessionTransactions.map((s) => ({
                            event: s.event,
                            label: `实时交互 · ${s.event}`,
                            batchId: s.batchId,
                            txHash: s.txHash,
                            blockNumber: s.blockNumber ?? 0,
                            contractAddress: s.contractAddress,
                            explorerUrl: s.explorerUrl,
                          })),
                          ...chainStatus.verifiedTransactions,
                        ]
                      : chainStatus.verifiedTransactions
                    ).map((tx) => (
                      <div className="mainnet-tx-row" key={tx.txHash}>
                        <div>
                          <b>{tx.label}</b>
                          <span>
                            批次 {tx.batchId} · {tx.blockNumber ? `区块 #${tx.blockNumber}` : "实时广播"}
                          </span>
                          <code>{tx.txHash}</code>
                        </div>
                        <a href={tx.explorerUrl} target="_blank" rel="noreferrer" className="explorer-link-btn">
                          区块浏览器核验 ↗
                        </a>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </WalletContext.Provider>
  );
}
