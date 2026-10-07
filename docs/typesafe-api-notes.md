# TypeSafe API 接入说明

## 已确认

- API 入口：`POST /v1/run`。
- 请求主体包含 `state`、可选 `model` 和 `questions`。
- question 类型包括 `noul`、`choice`、`score`。
- API key 通过 `Authorization: Bearer <API_KEY>` 发送。
- 默认模型可使用 `jev-latest`，但当前代码允许调用方显式传入。

## 本地占位

真实密钥不写入仓库。复制 `.env.example` 为本地环境配置，并填写：

```text
TYPESAFE_API_KEY=
```

当前测试只验证请求结构和 key 位置，不发起真实网络请求。

## 与本项目 JEV 的关系

本项目的数据层/JEV Context 是业务事实上下文；TypeSafe 的 `state` 是把该上下文传给模型的请求字段。

生产、检测和消费者三个 Agent 后续分别生成自己的 `questions`，但不能让 TypeSafe 直接决定数据库写入、硬规则结果或信誉分。
