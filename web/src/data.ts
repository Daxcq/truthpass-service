export const RULES = [
  { name: "任务匹配", desc: "证据 taskId 与任务 taskId 一致" },
  { name: "批次匹配", desc: "报告批次与请求批次一致" },
  { name: "时间逻辑", desc: "报告时间 ≥ 生产时间" },
  { name: "签名有效", desc: "实验室 ECDSA 签名验证通过" },
  { name: "物流连续", desc: "冷链 gap 2h ≤ 6h" },
  { name: "EPA+DHA", desc: "78% ≥ 70%" },
  { name: "过氧化值", desc: "2.1 ≤ 5" },
  { name: "TOTOX", desc: "11 ≤ 20" },
  { name: "冷链中断", desc: "2h ≤ 6h" },
];

// 数值条填充比例：EPA+DHA 以 100 为满刻度，其余以验收阈值归一化。
export const METRIC_BAR_PCT: Record<string, number> = {
  "epa-dha": 78,
  peroxide: 42,
  "cold-chain": 33,
};

export const ICON_URLS: Record<string, string> = {
  fish: "/assets/icon-fish.png",
  warning: "/assets/icon-warning.png",
  snowflake: "/assets/icon-snowflake.png",
  sensor: "/assets/icon-sensor.png",
  agent: "/assets/icon-agent.png",
  rule: "/assets/icon-rule.png",
  chain: "/assets/icon-chain.png",
};
