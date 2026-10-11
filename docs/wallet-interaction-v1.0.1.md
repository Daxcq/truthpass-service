# 真验 v1.0.1：钱包交互与主网交易准备

> 文档版本：v1.0.1  
> 状态：当前实现交接说明  
> 最近修改：2026-10-11  
> 修改摘要：补齐浏览器钱包交互、主网交易准备的 RPC 故障边界，以及交易回执确认规则。  
> 影响范围：网页观察台、消费者 Agent、BOT Chain Mainnet、钱包角色、队友交接  
> 队友下一步：把演示单钱包替换为生产角色钱包，并接入真实 EvidenceEnvelope 与权限回读。

## 1. 当前可运行闭环

```text
网页或消费者 Agent
      ↓ POST /api/wallet/prepare
BFF 使用已验证部署清单生成 calldata
      ↓ 返回 chainId=677、合约地址、requiredRole
MetaMask / OKX / Binance Wallet 确认 Chain ID 677
      ↓ eth_sendTransaction
BOT Chain Mainnet 合约
      ↓ eth_getTransactionReceipt
网页展示 txHash、区块号和浏览器链接
```

网页只是演示入口；消费者自己的 Agent 可以调用同一个 BFF 或安装 CLI。BFF 不持有消费者私钥，也不替钱包签名。

远程 Agent 先读取 `GET /api/agent/manifest`，其中的 `walletPrepare`、`walletActions` 和 `chain` 字段是当前钱包交互合同；随后将用户明确同意的动作提交到 `POST /api/wallet/prepare`。
部署在内网穿透或反向代理后时，设置 `TRUTHPASS_PUBLIC_URL`，或转发 `X-Forwarded-Proto` / `X-Forwarded-Host`，这样 manifest 返回的接口地址不会错误地指向 `localhost`。

## 2. 交易准备为什么不再依赖 RPC

`config/bot-chain-mainnet.deployed.json` 保存了部署回执已验证的三元组：

- `chainId = 677`；
- `contract.address`；
- `contract.domainSeparator`。

`POST /api/wallet/prepare` 只在这三个值完整且地址与 `TRUTHPASS_CONTRACT_ADDRESS` 一致时生成 calldata。它不会把 RPC 健康状态当成交易准备条件，因此短暂的 RPC 超时不会阻断钱包操作。

这不等于交易已经上链。钱包仍必须在 Chain ID 677 上签名并广播，前端还必须读取成功 receipt 和对应事件后，才可以显示 `anchored`。如果签名被拒绝、交易失败或事件不匹配，状态保持 `anchor_pending` 或 `anchor_failed`。

## 3. 支持的业务动作

| `action` | 合约函数 | 需要的角色 | 典型调用方 |
| --- | --- | --- | --- |
| `evidence` | `anchorEvidence` | `EVIDENCE_WRITER_ROLE` | 生产 Agent / 证据钱包 |
| `verification` | `recordVerification` | `VERIFIER_ROLE` | 确定性 Verifier / 质检钱包 |
| `purchase` | `recordPurchase` | `PURCHASE_WRITER_ROLE` | 消费者 Agent / 购买钱包 |
| `contribution` | `recordContribution` | `CONTRIBUTION_WRITER_ROLE` | 消费者反馈钱包 |
| `dispute` | `raiseDispute` | `DISPUTE_ROLE` | 消费者 Agent / 仲裁流程 |

请求最小格式：

```json
{
  "action": "evidence",
  "wallet": "0x消费者或角色钱包地址",
  "batchId": "FO-2026-001",
  "clientNonce": "demo-001"
}
```

文本 ID 会在 BFF 内部转换为 `bytes32` 哈希；生产环境应由上游 EvidenceEnvelope 提供已经规范化的哈希，并用独立角色钱包签名。

## 4. 钱包端的强制检查

`web-demo/wallet.js` 使用 EIP-1193：

1. 请求钱包账户；
2. 检查当前 `eth_chainId`；
3. 必要时请求切换或添加 BOT Chain Mainnet；
4. 只发送 BFF 返回的 `to/data/value`；
5. 轮询 `eth_getTransactionReceipt`；
6. 返回 `txHash`、receipt 和 `https://scan.botchain.ai/tx/<txHash>`。

钱包拒绝切链或签名时，页面不更新业务状态，也不伪造交易成功。

## 5. 运行与验证

```powershell
npm ci
npm run typecheck
npm test
$env:TRUTHPASS_WEB_PORT = "4199"
npm run web:server
```

另开终端准备一笔证据交易：

```powershell
$body = @{ action = "evidence"; wallet = "0x2eBd8467735EE3534be6add92f3D7231BA693c08"; batchId = "FO-2026-001"; clientNonce = "smoke-1" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:4199/api/wallet/prepare -ContentType "application/json" -Body $body
```

验收点：

- HTTP `200`；
- `chainId = 677`；
- `contractAddress` 等于部署清单地址；
- `transaction.data` 以 `anchorEvidence` selector 开始；
- 返回 `requiredRole` 和浏览器地址；
- 真正发交易后必须有成功 receipt 和目标事件。

## 6. 当前边界与生产补齐

当前仓库已经具备网页钱包入口、五类 calldata、主网部署元数据和公开业务回放。当前演示仍使用 `demo/synthetic` 数据，主网角色仍是演示配置，不能把它描述成已经接入真实厂家产线。

生产交付前需要：

- 厂家、设备、实验室、质检员和消费者钱包拆分；
- `EvidenceEnvelope` 的真实签名、nonce、sequence 和吊销；
- 角色授权 receipt、KMS/HSM 或外部签名服务；
- receipt 持久化、事件校验、失败重试和争议/召回状态；
- 通过 mTLS、Agent 身份和限流保护远程 CLI 接口。

