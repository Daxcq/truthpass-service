# TruthPass 持久化与传感器协议 v1.1.6

- 版本：v1.1.6
- 修改日期：2026-10-14
- Supabase 项目 Ref：`isdoylgyneijwrzmemou`
- 变更状态：迁移文件已提交；当前连接器没有执行 DDL 的权限，需要在 Supabase SQL Editor 或有权限的迁移环境执行。

## 当前核验

- Supabase Auth 邮箱登录配置可访问，`disable_signup=false`。
- `orders` 表可访问。
- `verification_history` 表存在，但原表缺少 `details` 列，导致完整检测记录无法保存。
- Vercel 前端已经使用该项目的 publishable key，密钥不写入 Git。

## 迁移内容

迁移文件：`supabase/migrations/20261014_truthpass_persistence.sql`

迁移会完成：

- 给 `verification_history` 增加 `details jsonb`；
- 为 `verification_history`、`orders` 增加用户级 RLS；
- 新增 `sensor_telemetry`，记录传感器数据、设备、时间、证据哈希和链上交易哈希；
- 新增 `quality_checks`，记录 Agent、实验室、传感器和人工复核结果；
- 新增 `profit_ledger`，记录原料、生产、检测、物流、平台、消费者价格、返利和储备金；
- 为批次与时间建立索引。

执行迁移后，先在 SQL Editor 运行：

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'verification_history';
```

确认存在 `details` 后，再测试登录和历史记录保存。

## 传感器与链上策略

传感器每 30 秒生成一条带序号和设备签名的测量记录。原始数据进入 `sensor_telemetry`，Agent/JEV 依据 `ruleVersion` 生成 `quality_checks`，并计算批次证据 Merkle Root。

链上只写入周期性根哈希、规则版本、Agent 运行哈希和利润根哈希，不把原始商业数据或个人数据写入公链。这样可以持续校验真实性，同时控制 Gas 成本和隐私风险。

本地模拟命令：

```powershell
npm run simulate:sensor-protocol
```

输出包括：

- 传感器测量序列；
- 每条测量的 `evidenceHash`；
- 批次 `evidenceRoot`；
- JEV/Agent 运行哈希；
- 成本与利润账本明细；
- 可提交给 BOT Chain 677 的锚定载荷。

## 登录测试边界

目前只能确认 Supabase Auth 服务可访问，不能代替用户输入邮箱、密码或验证码。登录测试需要使用者在页面的“登录 / 注册”弹窗中自行输入账号，登录后再执行一次批次验证，检查“我的记录”是否出现新记录。
