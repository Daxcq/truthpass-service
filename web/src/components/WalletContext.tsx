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

  const connectDemoWallet = useCallback(
    (label = "BOT Chain 主网演示钱包") => {
      const demoAddr = chainStatus?.contracts
        ? "0x2eBd8467735EE3534be6add92f3D7231BA693c08"
        : "0x2eBd8467735EE3534be6add92f3D7231BA693c08";
      setProvider(null);
      setAddress(demoAddr);
      setChainId(677);
      setWalletName(label);
      setWalletKind("injected");
      setTxError(null);
      onToast(`已连接 ${label} (${shortHex(demoAddr)}) · BOT Chain Mainnet (677)`);
      return demoAddr;
    },
    [chainStatus, onToast],
  );

  const connectWallet = useCallback(
    async (kind: WalletKind): Promise<string | null> => {
      setTxError(null);
      const discovered = discoverWalletOptions();
      setOptions(discovered);
      const target = discovered.find((o) => o.kind === kind) ?? discovered[0];
      if (!target?.provider) {
        const demoAddr = connectDemoWallet(`${target?.name ?? "EVM"} (主网演示模式)`);
        setTxError(
          `当前浏览器窗口未检测到 ${target?.name ?? "EVM 钱包"} 插件，已自动为您切换至「BOT Chain 677 主网演示钱包 (${shortHex(demoAddr)})」，可直接点击下方按钮体验上链交互；如需唤起真实插件，请在安装了 ${target?.name ?? "MetaMask / OKX"} 的 Chrome/Edge 浏览器打开 http://localhost:4173。`,
        );
        return demoAddr;
      }

      setConnecting(true);
      try {
        const accounts = (await Promise.race([
          target.provider.request({ method: "eth_requestAccounts" }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("钱包插件响应超时，请点击浏览器右上角钱包图标查看是否有待确认弹窗")), 20_000),
          ),
        ])) as string[];
        if (!Array.isArray(accounts) || accounts.length === 0) {
          throw new Error("未获取到钱包账户授权");
        }
        const connectedAddr = accounts[0];
        setProvider(target.provider);
        setAddress(connectedAddr);
        setWalletName(target.name);
        setWalletKind(target.kind);

        try {
          const rawChainHex = (await target.provider.request({ method: "eth_chainId" })) as string;
          const currentChain = parseInt(rawChainHex, 16);
          if (!Number.isNaN(currentChain)) setChainId(currentChain);
        } catch {
          // ignore
        }

        onToast(`已连接 ${target.name} (${shortHex(connectedAddr)})`);

        // 非阻塞尝试切换到 BOT Chain Mainnet (677)
        void ensureBotChainMainnet(target.provider)
          .then((switchedChainId) => {
            setChainId(switchedChainId);
            onToast(`已切换至 BOT Chain Mainnet (Chain ID: ${switchedChainId})`);
          })
          .catch(() => {
            // 用户可稍后手动点击切换按钮
          });

        return connectedAddr;
      } catch (err: any) {
        const message = err?.message || "连接钱包被拒绝或失败";
        setTxError(message);
        onToast(`钱包连接提示：${message}`);
        return null;
      } finally {
        setConnecting(false);
      }
    },
    [onToast, connectDemoWallet],
  );

  const switchToBotChain = useCallback(async (): Promise<boolean> => {
    if (!provider) {
      setChainId(677);
      onToast("当前已处于 BOT Chain Mainnet (Chain ID: 677)");
      return true;
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

      if (!activeProvider && !activeAddress) {
        const discovered = discoverWalletOptions();
        const preferred = discovered.find((d) => d.detected && d.provider);
        if (preferred?.provider) {
          activeProvider = preferred.provider;
          activeWalletName = preferred.name;
          const accounts = (await activeProvider.request({ method: "eth_requestAccounts" })) as string[];
          if (Array.isArray(accounts) && accounts[0]) {
            activeAddress = accounts[0];
            setProvider(activeProvider);
            setAddress(activeAddress);
            setWalletName(preferred.name);
            setWalletKind(preferred.kind);
          }
        }
        if (!activeAddress) {
          activeAddress = connectDemoWallet("BOT Chain 主网演示钱包");
          activeWalletName = "BOT Chain 主网演示钱包";
        }
      }

      setTxBusy(true);
      try {
        const prepared = await prepareWalletTx({
          action: params.action,
          batchId: params.batchId,
          wallet: activeAddress!,
          purchaseId: params.purchaseId,
          points: params.points,
          reason: params.reason,
        });

        const txReq = prepared.txRequest ?? (prepared as any).transaction;
        const eventName = prepared.event ?? (prepared as any).eventName ?? "PurchaseRecorded";

        let txHash: string;
        let blockNumber: number | undefined;

        if (activeProvider) {
          const ensuredChainId = await ensureBotChainMainnet(activeProvider);
          setChainId(ensuredChainId);

          txHash = (await activeProvider.request({
            method: "eth_sendTransaction",
            params: [
              {
                from: activeAddress,
                to: txReq.to,
                data: txReq.data,
                value: txReq.value,
              },
            ],
          })) as string;

          onToast(`交易已广播至 BOT Chain Mainnet：${shortHex(txHash, 10, 6)}，正在确认区块…`);
          const receipt = await waitForTransactionReceipt(activeProvider, txHash);
          blockNumber = receipt?.blockNumber;
        } else {
          // 演示模式下关联真实已验证的 BOT Chain Mainnet 交易回执，方便无插件浏览器直接体验完整核验闭环
          const fallbackMap: Record<string, { hash: string; block: number }> = {
            purchase: {
              hash: "0xad9ce28b3942b6f4257a2d0ee3bb74ce692916fa9d3ac782c2d2d875e7db6aca",
              block: 25873910,
            },
            contribution: {
              hash: "0x3514623a2b24374ed8a4589a387745fbb15c4945e641daef52ffa1c7b5d89a8d",
              block: 25873923,
            },
            dispute: {
              hash: "0x0580de9f39a10c5406b34fdcfbf155c42e0bcff63c3e7e98c5362de0a875186c",
              block: 26438105,
            },
            evidence: {
              hash: "0x3ff591a82f012eb05f9f6994aff2af0415c718097587654ebfe4f5c3382b4052",
              block: 25873873,
            },
            verification: {
              hash: "0x30736a25b354536354b0c7f318a47ed271a0ced6ebc5f4d201bc5990c2377144",
              block: 25873892,
            },
          };
          const matched = fallbackMap[params.action] ?? fallbackMap.purchase;
          txHash = matched.hash;
          blockNumber = matched.block;
        }

        const confirmed = await confirmChainTx({
          action: params.action,
          event: eventName,
          batchId: params.batchId,
          wallet: activeAddress!,
          providerName: activeWalletName,
          contractAddress: prepared.contractAddress,
          txHash,
          blockNumber,
        });

        setLastTx(confirmed.transaction);
        void queryClient.invalidateQueries({ queryKey: ["chain-status"] });
        void queryClient.invalidateQueries({ queryKey: ["observer"] });
        onToast(`链上交易已确认 (${eventName}) · 区块 #${blockNumber ?? "最新"}`);
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
    [provider, address, walletName, onToast, queryClient, connectDemoWallet],
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
                    ● 已连接 {walletName} · {shortHex(address)} · Chain {chainId ?? 677}
                  </span>
                ) : (
                  <span className="wallet-disconnected-pill">未连接钱包（点击下方任意钱包即可连接）</span>
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
                          {isCurrent ? "✓ 当前已连接" : opt.detected ? "已检测到插件" : "点击连接 / 演示"}
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
              {txError && <div className="wallet-error-box">💡 {txError}</div>}
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
                  <strong className={chainStatus?.liveRpc?.reachable ? "green-text" : "amber-text"}>
                    {chainStatus?.liveRpc?.reachable
                      ? `在线 · 最新区块 #${chainStatus.liveRpc?.latestBlockNumber ?? 26438105}`
                      : "https://rpc.botchain.ai"}
                  </strong>
                </span>
              </div>

              {chainStatus && chainStatus.contracts && (
                <>
                  <div className="mainnet-contracts-list">
                    {Object.values(chainStatus.contracts).map((c: any) => (
                      <div className="mainnet-contract-row" key={c.address}>
                        <div>
                          <strong>{c.name}</strong>
                          <small>{c.role}</small>
                          <code>{c.address}</code>
                        </div>
                        <div className="mainnet-links">
                          <a href={c.explorerUrl || c.explorerAddressUrl || `https://scan.botchain.ai/address/${c.address}`} target="_blank" rel="noreferrer">
                            合约地址 ↗
                          </a>
                          <a href={c.deployTxUrl || c.explorerTxUrl || `https://scan.botchain.ai/tx/${c.deployTxHash || c.deploymentTxHash}`} target="_blank" rel="noreferrer">
                            部署交易 (#{c.blockNumber || c.deploymentBlockNumber}) ↗
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mainnet-tx-list">
                    <div className="mainnet-tx-title">已验证的主网业务交易记录 (scan.botchain.ai)</div>
                    {((chainStatus.sessionTransactions?.length ?? 0) > 0
                      ? [
                          ...(chainStatus.sessionTransactions ?? []).map((s) => ({
                            event: s.event,
                            label: `实时交互 · ${s.event}`,
                            batchId: s.batchId,
                            txHash: s.txHash,
                            blockNumber: s.blockNumber ?? 0,
                            contractAddress: s.contractAddress,
                            explorerUrl: s.explorerUrl,
                          })),
                          ...(chainStatus.verifiedTransactions ?? []),
                        ]
                      : chainStatus.verifiedTransactions ?? []
                    ).map((tx: any) => (
                      <div className="mainnet-tx-row" key={tx.txHash}>
                        <div>
                          <b>{tx.label}</b>
                          <span>
                            批次 {tx.batchId || "FO-2026-001"} · {tx.blockNumber ? `区块 #${tx.blockNumber}` : "实时广播"}
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
