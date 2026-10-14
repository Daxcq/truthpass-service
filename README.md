# TruthPass（真验）— BOT Chain Mainnet (Chain ID: 677)

> 让真实被看见，让信任不再靠嘴说，而靠一条真正可验证的证据链。

TruthPass 构建了一种全新的生产与消费范式：消费者不再只是购买商品、被动接受结果，而是通过自己的 AI Agent 与 EVM 钱包，真正介入产品的生产、检测、交接、购买绑定与售后维权全过程。

当前以 **深海鱼油** 作为首发品类，完整跑通 **「AI 对话 → 溯源验证 → EVM 多钱包连接（MetaMask / OKX Wallet / Binance Wallet）→ BOT Chain Mainnet (677) 真实上链 → 消费者共建 → 检测报告」** 闭环。

---

## 🏆 汉客松五大评审要求核验清单（Judge Verification Checklist）

### 1️⃣ 公开 GitHub 仓库与可审核代码材料（已脱敏）
- **公开 GitHub 仓库**：
  - 主仓库：[`https://github.com/icelikey/truthpass-service`](https://github.com/icelikey/truthpass-service)
  - 镜像仓库：[`https://github.com/Daxcq/truthpass-service`](https://github.com/Daxcq/truthpass-service)
- **脱敏与可审计说明**：
  - 所有私钥、API 密钥与本地证书均已通过 `.gitignore` 严格隔离，仅提供脱敏的 `.env.example` 与 `config/bot-chain-mainnet.example.json`。
  - 全部链上合约源码（`contracts/*.sol`）、部署与重放脚本（`scripts/*.mjs`）、BOT Chain Mainnet 部署清单与链上交易回执（`config/bot-chain-mainnet.*.json`）、前后端交互源码（`src/`、`web/`、`api-server.ts`）及自动化测试（`test/`）均 100% 公开可审计。

### 2️⃣ 具备真实交互能力的产品页面（非静态展示 / PPT）
前端工作台（`web/` + `api-server.ts`）提供端到端真实业务交互：
1. **多批次实时溯源核验**：支持切换 `FO-2026-001` 至 `FO-2026-010` 共 10 个批次（含合格批次与过氧化值超标拦截批次 `FO-2026-003` / `FO-2026-007`），实时调用确定性规则引擎计算验收结果。
2. **IoT 冷链异常实时仿真**：在证据链面板可一键注入「正常冷链（3.8°C）」「温控超标（8.5°C，触发自动拦截）」与「传感器离线」数据流（`POST /api/simulator/iot`），实时重算证据哈希与验收状态。
3. **TruthPass AI 调查员对话 & 智能补货下单**：支持自然语言或语音查询批次、核验指标、推荐补货并生成订单，订单支持一键调用 EVM 钱包上链锚定。
4. **评委观察台（Observer Drawer）**：支持在浏览器端实时执行 `GET /api/jev/detection` 与 `GET /api/chain/status`，实时向 `https://rpc.botchain.ai` 验证主网区块高度与合约 Bytecode 存活状态。
5. **可打印第三方检测证书**：支持打开 `/report.html?batch=FO-2026-001` 预览或导出 PDF 报告。

### 3️⃣ 支持 MetaMask、OKX Wallet、Binance Wallet 等多 EVM 钱包并具备真实链上交互
- **多钱包自动发现与连接（`web/src/lib/wallet.ts` & `web/src/components/WalletContext.tsx`）**：
  - 同时支持 **EIP-6963** 多钱包发现协议与 **EIP-1193** 注入式 Provider：
    - **MetaMask**（`window.ethereum` / `io.metamask`）
    - **OKX Wallet**（`window.okxwallet` / `com.okex.wallet`）
    - **Binance Wallet**（`window.binancew3w.ethereum` / `BinanceChain` / `com.binance.wallet`）
    - 其他兼容 EVM 钱包（Rabby、TokenPocket、Trust Wallet、Coinbase Wallet 等）
- **自动切换 / 添加 BOT Chain Mainnet (`Chain ID: 677` / `0x2a5`)**：
  - 连接钱包或发起交易时自动调用 `wallet_switchEthereumChain` / `wallet_addEthereumChain` 切换至 BOT Chain Mainnet。
- **三大真实产品级链上交互功能（直接唤起钱包签名并广播至 BOT Chain Mainnet 677）**：
  1. **🛒 购买凭证上链（`recordPurchase`）**：在「连接钱包 & 链上交互」弹窗或「我的记录 → 补货订单」中点击 **「⛓️ 订单上链 (677)」**，调用 `TruthPassConsumerGateway.recordPurchase` 将当前批次订单写入主网。
  2. **🤝 消费者共建反馈上链（`recordContribution`）**：在页面底部「消费者授权共建」勾选授权并提交评分/标签后，自动或手动调用 `TruthPassConsumerGateway.recordContribution` 将反馈哈希锚定至主网。
  3. **⚖️ 质量争议保证金仲裁（`raiseDispute`）**：调用 `TruthPassAuditEscrow.raiseDispute`（可附带 `0.0001 BOT` 争议保证金）在链上发起质量争议工单。

---

## ⛓️ 4️⃣ & 5️⃣ BOT Chain Mainnet (Chain ID: 677) 合约地址、交易记录与区块浏览器链接

### 网络参数（BOT Chain Mainnet）

| 参数项 | 值 |
| --- | --- |
| **Network Name** | `BOT Chain Mainnet` |
| **Chain ID (Decimal / Hex)** | `677` / `0x2a5` |
| **RPC Endpoint** | `https://rpc.botchain.ai` |
| **Native Currency** | `BOT` (18 Decimals) |
| **Block Explorer** | [`https://scan.botchain.ai`](https://scan.botchain.ai) |

---

### 已部署主网合约清单（Verified Mainnet Contracts）

| 合约名称 | 用途说明 | 主网合约地址 | 部署区块 | 部署交易 Hash | 区块浏览器链接 |
| --- | --- | --- | --- | --- | --- |
| **`TruthPassEvidenceAnchor`** | 核心证据锚定、检验验证、购买与共建账本（含 EIP-712 验签与 RBAC 权限控制） | `0x0033462bee153cb9DF12b5c447b9C282DbfbE877` | `25861690` | `0xbc9bfe2b4a78fbf95d7795a5a67f14402cb9b8e0c6cf406d7ab39be3a65442b6` | [查看合约](https://scan.botchain.ai/address/0x0033462bee153cb9DF12b5c447b9C282DbfbE877) \| [部署交易](https://scan.botchain.ai/tx/0xbc9bfe2b4a78fbf95d7795a5a67f14402cb9b8e0c6cf406d7ab39be3a65442b6) |
| **`TruthPassConsumerGateway`** | 面向任意消费者 EVM 钱包（MetaMask / OKX / Binance）开放的无许可购买与共建上链网关（已授予主合约 `CONSUMER_ROLE`） | `0x5192484B107E51EADFda4DBF4c9fFa41C03453F1` | `26438022` | `0x9585f9cb8766b539f6289be7db8fa4a4f980535f9818c81423e24f3bd2281180` | [查看合约](https://scan.botchain.ai/address/0x5192484B107E51EADFda4DBF4c9fFa41C03453F1) \| [部署交易](https://scan.botchain.ai/tx/0x9585f9cb8766b539f6289be7db8fa4a4f980535f9818c81423e24f3bd2281180) |
| **`TruthPassAuditEscrow`** | 消费者质量争议保证金托管、挑战与审计赔付合约（支持任意 EVM 钱包发起 `raiseDispute`） | `0x722a4291C64B5BD3ED374AD457Ba6326681C2933` | `26438083` | `0xc9f08364e8adbd0e2d5c30ce0a8e9f4f427792650eb5f845f0f83df84f1a5b2c` | [查看合约](https://scan.botchain.ai/address/0x722a4291C64B5BD3ED374AD457Ba6326681C2933) \| [部署交易](https://scan.botchain.ai/tx/0xc9f08364e8adbd0e2d5c30ce0a8e9f4f427792650eb5f845f0f83df84f1a5b2c) |

---

### 可验证的主网交易记录（Verified Mainnet Transactions）

#### A. 业务全生命周期锚定交易（批次 `FO-2026-001`）

| 业务阶段 | 链上事件 / 方法 | 区块高度 | 交易哈希 (Transaction Hash) | BOT Chain 区块浏览器链接 |
| --- | --- | --- | --- | --- |
| **1. 生产与冷链证据锚定** | `EvidenceAnchored` (`anchorEvidence`) | `25873873` | `0x3ff591a82f012eb05f9f6994aff2af0415c718097587654ebfe4f5c3382b4052` | [`https://scan.botchain.ai/tx/0x3ff591a82f012eb05f9f6994aff2af0415c718097587654ebfe4f5c3382b4052`](https://scan.botchain.ai/tx/0x3ff591a82f012eb05f9f6994aff2af0415c718097587654ebfe4f5c3382b4052) |
| **2. 确定性检测规则核验** | `VerificationRecorded` (`recordVerification`) | `25873892` | `0x30736a25b354536354b0c7f318a47ed271a0ced6ebc5f4d201bc5990c2377144` | [`https://scan.botchain.ai/tx/0x30736a25b354536354b0c7f318a47ed271a0ced6ebc5f4d201bc5990c2377144`](https://scan.botchain.ai/tx/0x30736a25b354536354b0c7f318a47ed271a0ced6ebc5f4d201bc5990c2377144) |
| **3. 消费者订单购买绑定** | `PurchaseRecorded` (`recordPurchase`) | `25873910` | `0xad9ce28b3942b6f4257a2d0ee3bb74ce692916fa9d3ac782c2d2d875e7db6aca` | [`https://scan.botchain.ai/tx/0xad9ce28b3942b6f4257a2d0ee3bb74ce692916fa9d3ac782c2d2d875e7db6aca`](https://scan.botchain.ai/tx/0xad9ce28b3942b6f4257a2d0ee3bb74ce692916fa9d3ac782c2d2d875e7db6aca) |
| **4. 消费者授权共建反馈** | `ContributionRecorded` (`recordContribution`) | `25873923` | `0x3514623a2b24374ed8a4589a387745fbb15c4945e641daef52ffa1c7b5d89a8d` | [`https://scan.botchain.ai/tx/0x3514623a2b24374ed8a4589a387745fbb15c4945e641daef52ffa1c7b5d89a8d`](https://scan.botchain.ai/tx/0x3514623a2b24374ed8a4589a387745fbb15c4945e641daef52ffa1c7b5d89a8d) |

#### B. 合约权限配置交易（RBAC Role Grants）

| 权限操作 | 目标合约 | 区块高度 | 交易哈希 (Transaction Hash) | BOT Chain 区块浏览器链接 |
| --- | --- | --- | --- | --- |
| 授予 `PRODUCER_ROLE` / `INSPECTOR_ROLE` / `CONSUMER_ROLE` | `TruthPassEvidenceAnchor` | `25873732` | `0xbb56d6b03d6a4bb4906e89b44e065a62988078ce1d1682a34c4902ab0ac3be98` | [`https://scan.botchain.ai/tx/0xbb56d6b03d6a4bb4906e89b44e065a62988078ce1d1682a34c4902ab0ac3be98`](https://scan.botchain.ai/tx/0xbb56d6b03d6a4bb4906e89b44e065a62988078ce1d1682a34c4902ab0ac3be98) |
| 授予 `TruthPassConsumerGateway` 合约 `CONSUMER_ROLE` | `TruthPassEvidenceAnchor` | `26438041` | `0xf17bfaeeb5e65fa18f75657bf0ec4fc81db5cc6326faedeb4a40b7120c2ecff2` | [`https://scan.botchain.ai/tx/0xf17bfaeeb5e65fa18f75657bf0ec4fc81db5cc6326faedeb4a40b7120c2ecff2`](https://scan.botchain.ai/tx/0xf17bfaeeb5e65fa18f75657bf0ec4fc81db5cc6326faedeb4a40b7120c2ecff2) |
| 授予审计员 `AUDITOR_ROLE` | `TruthPassAuditEscrow` | `26438105` | `0x0580de9f39a10c5406b34fdcfbf155c42e0bcff63c3e7e98c5362de0a875186c` | [`https://scan.botchain.ai/tx/0x0580de9f39a10c5406b34fdcfbf155c42e0bcff63c3e7e98c5362de0a875186c`](https://scan.botchain.ai/tx/0x0580de9f39a10c5406b34fdcfbf155c42e0bcff63c3e7e98c5362de0a875186c) |

---

## 🚀 快速启动与核验指南

### 1. 安装与一键启动产品工作台

```bash
npm install
cp .env.example .env   # 可选：配置 DeepSeek / StepFun / Supabase，不配置亦可完整运行所有确定性验证与链上交互

# 一键构建前端并启动服务（默认监听 http://localhost:4173）
npm run start
```

打开浏览器访问 `http://localhost:4173`：
1. 点击顶部导航栏 **「连接钱包 (MetaMask / OKX / Binance)」** 按钮，选择已安装的钱包（MetaMask、OKX Wallet、Binance Wallet 等），自动切换至 **BOT Chain Mainnet (`Chain ID: 677`)**。
2. 在弹窗中可直接点击 **「🛒 购买凭证上链」**、**「🤝 共建反馈上链」** 或 **「⚖️ 发起质量争议仲裁」**，钱包将弹出真实交易签名框，确认后交易直接广播至 BOT Chain Mainnet 并生成可点击的 `https://scan.botchain.ai/tx/...` 链接。
3. 在左侧对话栏点击快捷提问（如「帮我查一下这批鱼油的检测情况」）或切换批次（如 `FO-2026-003` 不合格批次），体验 IoT 冷链温度模拟、CLI 观察台、评委观察台与消费者授权共建。

### 2. CLI 命令行与主网状态核验

```bash
# 查看批次 FO-2026-001 的确定性验收结论与 BOT Chain 主网锚定回执
npm run cli -- inspect --batch FO-2026-001 --json

# 推荐与下单
npm run cli -- recommend --batch FO-2026-001 --json
npm run cli -- order --batch FO-2026-001 --json

# 运行全量单元测试与类型检查
npm run typecheck
npm test
```

---

## 📂 目录结构说明

```text
contracts/
  TruthPassEvidenceAnchor.sol      # 主网核心证据、核验、购买与贡献账本合约
  TruthPassConsumerGateway.sol     # 面向消费者 EVM 钱包的无许可交互网关合约
  TruthPassAuditEscrow.sol         # 质量争议保证金托管与仲裁合约
config/
  bot-chain-mainnet.deployed.json  # TruthPassEvidenceAnchor 主网部署清单
  bot-chain-mainnet.gateway.json   # TruthPassConsumerGateway 主网部署清单
  bot-chain-mainnet.audit-escrow.json # TruthPassAuditEscrow 主网部署清单
  bot-chain-mainnet.replay.json    # 主网 4 笔核心业务生命周期交易回执
scripts/
  deploy-bot-chain-mainnet.mjs     # 主合约部署脚本
  deploy-consumer-gateway-mainnet.mjs # 消费者网关合约部署脚本
  deploy-audit-escrow-mainnet.mjs  # 争议仲裁合约部署脚本
  replay-bot-chain-mainnet.mjs     # 主网业务回放与核验脚本
src/                               # 核心后端：verifier / registry / consumer / chain / cli
web/                               # 交互式前端工作台（React + TypeScript + EIP-6963/EIP-1193 多钱包）
api-server.ts                      # 对接层 API：主网 RPC 状态探测、钱包交易编码、AI 调查员、IoT 模拟
test/                              # 确定性验证、CLI 与 BOT Chain 677 主网锚定测试套件
```
