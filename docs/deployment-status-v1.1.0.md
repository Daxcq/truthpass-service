# 真验 v1.1.0：主网部署状态交接

> 文档版本：v1.1.1\r\n> 最近修改：2026-10-12\r\n> 修改摘要：记录 Consumer Gateway、Audit Escrow 的真实主网部署、角色授权回执和本机代理配置。\r\n> 当前状态：合约已部署并完成角色回读；普通评委钱包现场交易仍待执行。

## 已完成

- `TruthPassConsumerGateway.sol` 已编译；
- `TruthPassAuditEscrow.sol` 已编译；
- Gateway 和 Escrow 部署脚本已加入 npm scripts；
- BFF 已支持 `TRUTHPASS_CONSUMER_GATEWAY_ADDRESS`；
- 普通用户钱包交易目标会切换到 Gateway；
- 49 项测试通过；
- 分支已推送至 `codex/botchain-mainnet-deployment`。

## 已完成的主网部署

| 组件 | 地址 | 部署交易 | 区块 |
|---|---|---|---:|
| Evidence Anchor | `0x0033462bee153cb9DF12b5c447b9C282DbfbE877` | 既有部署 | — |
| Consumer Gateway | `0x5192484B107E51EADFda4DBF4c9fFa41C03453F1` | [`0x9585…81180`](https://scan.botchain.ai/tx/0x9585f9cb8766b539f6289be7db8fa4a4f980535f9818c81423e24f3bd2281180) | 26438022 |
| Audit Escrow | `0x722a4291C64B5BD3ED374AD457Ba6326681C2933` | [`0xc9f0…a5b2c`](https://scan.botchain.ai/tx/0xc9f08364e8adbd0e2d5c30ce0a8e9f4f427792650eb5f845f0f83df84f1a5b2c) | 26438083 |

地址配置分别保存在 `config/bot-chain-mainnet.gateway.json` 和 `config/bot-chain-mainnet.audit-escrow.json`。

本机若需要通过 Clash/Mihomo 访问 RPC，必须在启动 Node 前设置代理，例如：

```powershell
$env:NODE_USE_ENV_PROXY="1"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
$env:HTTP_PROXY="http://127.0.0.1:7897"
```

Gateway 的 `PURCHASE_WRITER_ROLE`、`CONTRIBUTION_WRITER_ROLE`、`DISPUTE_ROLE` 已在 Anchor 上授权并回读；Audit Escrow 的 `DISPUTE_ROLE` 也已授权，使其可以把挑战同步到 Anchor。Escrow 自身的 `AUDIT_AGENT_ROLE`、`VERIFIER_ROLE`、`ARBITER_ROLE`、`TREASURY_ROLE` 已授予当前部署钱包并回读，属于黑客松演示的单钱包配置，生产环境应拆分为独立受控地址。

## 之前的预检结果

实际执行：

```powershell
npm run deploy:consumer-gateway-mainnet -- --dry-run
npm run deploy:audit-escrow-mainnet -- --dry-run
```

两条命令均返回：

```text
request timeout (code=TIMEOUT, version=6.17.0)
```

当时表示 BOT Chain RPC 当前不可达，预检没有拿到网络、Gas 或余额信息，也没有广播交易。随后通过本机显式 HTTPS 代理恢复访问并完成部署。

## 仍待完成的现场验收

1. 启动 BFF 和 C 端页面；
2. 使用非部署钱包 Connect Wallet 并切换 Chain ID `677`；
3. 完成一次 `purchase`，回读 `ConsumerPurchaseSubmitted + PurchaseRecorded`；
4. 完成一次 `contribution` 和 `dispute`，回读对应 Gateway/Anchor 事件；
5. 将普通用户交易 Hash 写入本文件和现场交付说明；
6. 将生产环境 Agent、Verifier、Arbiter 钱包从当前单钱包配置中拆分。

## 成功标准

```text
Gateway deployment receipt.status == 1
Escrow deployment receipt.status == 1
Gateway/Anchor role readback == true
普通评委钱包不是部署钱包
普通评委钱包没有 TruthPass 业务角色
消费者交易 receipt.status == 1
Consumer Gateway 事件和 Anchor 事件同时存在
页面显示真实 txHash 和 BOT Chain Explorer 链接
```

在这些条件满足前，项目只能标记为“代码完成、主网部署待恢复”，不能对外宣称已完成普通用户主网钱包验收。

