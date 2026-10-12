# 真验 v1.1.0：主网部署状态交接

> 文档版本：v1.1.0  
> 最近修改：2026-10-12  
> 修改摘要：记录 Consumer Gateway 和 Audit Escrow 的真实部署预检结果、当前阻塞和恢复后的执行顺序。  
> 当前状态：代码已推送；主网部署尚未提交交易。

## 已完成

- `TruthPassConsumerGateway.sol` 已编译；
- `TruthPassAuditEscrow.sol` 已编译；
- Gateway 和 Escrow 部署脚本已加入 npm scripts；
- BFF 已支持 `TRUTHPASS_CONSUMER_GATEWAY_ADDRESS`；
- 普通用户钱包交易目标会切换到 Gateway；
- 49 项测试通过；
- 分支已推送至 `codex/botchain-mainnet-deployment`。

## 预检结果

实际执行：

```powershell
npm run deploy:consumer-gateway-mainnet -- --dry-run
npm run deploy:audit-escrow-mainnet -- --dry-run
```

两条命令均返回：

```text
request timeout (code=TIMEOUT, version=6.17.0)
```

这表示 BOT Chain RPC 当前不可达，预检没有拿到网络、Gas 或余额信息，也没有广播交易。

## 恢复网络后的顺序

1. 先确认 `https://rpc.botchain.ai` 返回 Chain ID `677`；
2. 执行两个 `--dry-run`，核对 Gas 和余额；
3. 设置主网部署确认变量；
4. 部署 Consumer Gateway；
5. 部署 Audit Escrow；
6. 回读部署地址代码和构造参数；
7. 给 Gateway 授予 `PURCHASE_WRITER_ROLE`、`CONTRIBUTION_WRITER_ROLE`、`DISPUTE_ROLE`；
8. 给 Escrow 授予 `AUDIT_AGENT_ROLE`、`VERIFIER_ROLE`、`ARBITER_ROLE`、`TREASURY_ROLE`；
9. 回读每个 `hasRole`；
10. 写入本地受控配置，不提交私钥；
11. 使用普通评委钱包完成一次购买交易；
12. 保存真实 receipt、事件和 Explorer 链接。

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

