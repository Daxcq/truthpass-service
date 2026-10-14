# TruthPass Vercel 部署交付记录 v1.1.5

- 版本：v1.1.5
- 修改日期：2026-10-14
- Git 提交：`4beb741c13f373d692d15aff0feee0d6e144a40e`
- 分支：`codex/botchain-mainnet-deployment`

## 本次修改

1. 为预构建 React 前端增加 `web-frontend/package.json`，避免 Vercel 自动执行不存在的 Vite 构建。
2. 将 Vercel 项目根目录恢复为仓库根目录，使 `api/[[...path]].ts` 与 `src/web-server.ts` 一并部署。
3. 移除不兼容的函数运行时声明，使用 Vercel 默认 Node.js 运行时。
4. 将预构建页面目录配置为 `web-frontend/dist`。

## 公开地址

- 产品页面：<https://truthpass-service.vercel.app/>
- 健康检查：<https://truthpass-service.vercel.app/api/health>
- 链状态：<https://truthpass-service.vercel.app/api/chain/status>
- Agent Manifest：<https://truthpass-service.vercel.app/api/agent/manifest>
- GitHub：<https://github.com/icelikey/truthpass-service/tree/codex/botchain-mainnet-deployment>

## 线上核验结果

- Vercel deployment：`dpl_5EnuLbG1s7W4DGSSkWKuJ8goChbB`
- 状态：`READY`
- BOT Chain Mainnet：Chain ID `677`
- Evidence Anchor：`0x0033462bee153cb9DF12b5c447b9C282DbfbE877`
- Consumer Gateway：`0x5192484B107E51EADFda4DBF4c9fFa41C03453F1`
- `POST /api/wallet/prepare` 已返回消费者购买 calldata，目标地址为 Consumer Gateway。

## 真实用户交易步骤

1. 打开产品页面并点击 `Connect Wallet`。
2. 在钱包中确认 BOT Chain Mainnet，Chain ID `677`。
3. 输入批次 `FO-2026-001`，点击一次“确认购买”。
4. 在 MetaMask/OKX 钱包确认目标地址为 Consumer Gateway，再由用户本人确认交易。
5. 页面应展示交易 Hash 和 `https://scan.botchain.ai/tx/<hash>` 链接。

当前仓库中的历史回放仍标记为 `demo/synthetic`。评委验收还需要补充一笔由普通用户钱包签名的真实主网交易，并记录其 Hash、区块号和浏览器链接。

## 尚未完成

- Supabase 项目尚未创建，登录与历史记录暂不持久化。
- 真实用户交易需要在钱包插件中由用户本人确认，服务端不能代替用户输入密码、助记词或私钥。
