# 真验 v1.1.0：消费者钱包与 Agent 审计质押闭环

> 文档版本：v1.1.1\r\n> 最近修改：2026-10-12\r\n> 修改摘要：增加消费者无特权钱包路径、Consumer Gateway、事件级 receipt 校验、Agent 审计质押合约、主网部署地址和角色回执。\r\n> 当前状态：Gateway、Audit Escrow 已部署到 BOT Chain Mainnet；待用非部署钱包完成现场购买、反馈和质疑交易。\r\n> 队友下一步：接入地址配置，启动 C 端页面，完成普通钱包现场验收并替换演示单钱包角色。

## 1. 主办方验收对应关系

| 要求 | 当前实现 |
|---|---|
| C 端页面可访问 | `web-demo/` 和 `src/web-server.ts` |
| Connect Wallet | `web-demo/wallet.js`，EIP-1193 |
| MetaMask/OKX/Binance | 注入式 EVM Provider 选择 |
| BOT Chain Mainnet | Chain ID `677`，支持切换/添加网络 |
| 用户钱包签名 | Consumer Gateway 交易目标 |
| Hash 和 Explorer | receipt 回读后展示 |
| 可审核代码 | 公开 GitHub 仓库 |

## 2. 为什么新增 Gateway

现有 `TruthPassEvidenceAnchor` 的生产角色全部授予部署钱包。若消费者直接调用 Anchor，普通钱包会因 `PURCHASE_WRITER_ROLE`、`CONTRIBUTION_WRITER_ROLE` 或 `DISPUTE_ROLE` 回滚。

`TruthPassConsumerGateway` 作为受控消费者入口：

```text
消费者钱包（签名和付 Gas）
        ↓
TruthPassConsumerGateway
        ↓ 仅由 Gateway 持有消费者写入角色
TruthPassEvidenceAnchor
        ↓
BOT Chain Mainnet / Chain ID 677
```

Gateway 将 `purchaseId` 和 `disputeId` 绑定到 `msg.sender`，因此用户不需要拥有 Anchor 角色，其他用户也不能代替购买者提交反馈。

## 3. 当前交易目标

当配置 `TRUTHPASS_CONSUMER_GATEWAY_ADDRESS` 后：

| 动作 | 目标 |
|---|---|
| `evidence` | Evidence Anchor |
| `verification` | Evidence Anchor |
| `purchase` | Consumer Gateway |
| `contribution` | Consumer Gateway |
| `dispute` | Consumer Gateway |

`/api/wallet/prepare` 返回 `requiredRole=CONSUMER_SELF_SERVICE`，消费者钱包不需要业务角色。

## 4. Receipt 验收

前端只有同时满足以下条件才显示成功：

```text
receipt.status == 0x1
receipt.to == 预期交易目标
存在 Gateway 或 Anchor 对应事件
Gateway 交易同时存在 Anchor 业务事件
```

事件包括：

```text
ConsumerPurchaseSubmitted + PurchaseRecorded
ConsumerContributionSubmitted + ContributionRecorded
ConsumerDisputeSubmitted + DisputeRaised
EvidenceAnchored
VerificationRecorded
```

交易成功但事件不匹配时，页面显示“交易成功但业务事件未确认”。

## 5. Agent 质疑与审计质押

`TruthPassAuditEscrow` 负责质疑保证金和结算：

```text
消费者 Agent 发现异常
  → 用户钱包 openChallenge 并锁定保证金
  → Audit Agent 提交 agentRunHash、evidenceRoot 和审计结果
  → Verifier approveAuditFinding
  → Arbiter resolveChallenge
  → 质疑成功返还保证金并支付奖励
  → 质疑失败扣除保证金进入审计基金
```

Agent 不能直接结算资金。每次结算必须先有 Agent 证据和独立 Verifier 批准。

## 6. 主网部署

当前主网地址：

```text
Consumer Gateway: 0x5192484B107E51EADFda4DBF4c9fFa41C03453F1
Audit Escrow:    0x722a4291C64B5BD3ED374AD457Ba6326681C2933
Chain ID:        677
```

部署交易和角色授权回执见：

```text
config/bot-chain-mainnet.gateway.json
config/bot-chain-mainnet.audit-escrow.json
config/bot-chain-mainnet.roles.gateway.json
config/bot-chain-mainnet.roles.audit-escrow.json
```

新环境只需要准备本地环境变量（私钥不得进入仓库）：

```powershell
$env:TRUTHPASS_CONTRACT_ADDRESS="0x0033462bee153cb9DF12b5c447b9C282DbfbE877"
$env:TRUTHPASS_DEPLOYER_ADDRESS="0x..."
$env:TRUTHPASS_GATEWAY_DEPLOY_CONFIRM="DEPLOY_TRUTHPASS_GATEWAY_MAINNET"
```

执行预检：

```powershell
npm run deploy:consumer-gateway-mainnet -- --dry-run
npm run deploy:audit-escrow-mainnet -- --dry-run
```

历史部署已完成；重新部署只在合约升级时执行：

```powershell
npm run deploy:consumer-gateway-mainnet -- --confirm
npm run deploy:audit-escrow-mainnet -- --confirm
```

再将 Gateway 地址配置为：

```text
TRUTHPASS_CONSUMER_GATEWAY_ADDRESS=0x...
```

由管理员给 Gateway 授予：

```text
PURCHASE_WRITER_ROLE
CONTRIBUTION_WRITER_ROLE
DISPUTE_ROLE
```

每个授权都必须回读 `hasRole` 并保存交易 Hash。

## 7. 现场验收

评委使用自己的钱包完成：

1. Connect Wallet；
2. 切换到 Chain ID `677`；
3. 查询 `FO-2026-001`；
4. 点击确认购买；
5. 钱包确认 Gateway 交易；
6. 页面展示真实 txHash 和 Explorer；
7. 重新提交反馈；
8. 提交质疑；
9. 展示 Gateway 事件和 Anchor 事件。

历史 `config/bot-chain-mainnet.replay.json` 仍然是 `demo/synthetic` 回放，不能替代普通评委钱包的现场交易。

