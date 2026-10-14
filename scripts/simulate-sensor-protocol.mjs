import { createHash } from "node:crypto";

const batchId = process.env.TRUTHPASS_BATCH_ID ?? "FO-2026-001";
const count = Math.max(1, Number(process.env.TRUTHPASS_SENSOR_COUNT ?? 5));
const sensorId = process.env.TRUTHPASS_SENSOR_ID ?? "cold-chain-sensor-001";

function sha256(value) {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

function canonical(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

function merkleRoot(leaves) {
  if (leaves.length === 0) return sha256("");
  let level = leaves.slice();
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(sha256(`${left.slice(2)}${right.slice(2)}`));
    }
    level = next;
  }
  return level[0];
}

const telemetry = Array.from({ length: count }, (_, index) => {
  const packet = {
    batchId,
    sensorId,
    sequence: index + 1,
    observedAt: new Date(Date.now() + index * 30_000).toISOString(),
    metric: "storage_temperature_c",
    value: Number((2.2 + (index % 3) * 0.2).toFixed(1)),
    unit: "°C",
    deviceSignature: `simulated:${sensorId}:v1`,
  };
  return { ...packet, evidenceHash: sha256(canonical(packet)) };
});

const evidenceRoot = merkleRoot(telemetry.map((item) => item.evidenceHash));
const quality = {
  batchId,
  checkId: `quality-${batchId}-cold-chain-v1`,
  sourceType: "sensor",
  sourceId: sensorId,
  ruleVersion: "fish-oil-quality-v1",
  result: telemetry.every((item) => item.value >= 0 && item.value <= 8) ? "pass" : "review",
  score: telemetry.every((item) => item.value >= 0 && item.value <= 8) ? 100 : 72,
  evidenceRoot,
  agentRunHash: sha256(`${batchId}:jev:quality-v1:${evidenceRoot}`),
};

const profit = [
  ["raw_material", 38],
  ["production", 12],
  ["testing", 4],
  ["logistics", 6],
  ["platform", 3],
  ["consumer_price", 99],
].map(([entryType, amount]) => ({ batchId, entryType, amount, currency: "CNY", evidenceHash: sha256(`${batchId}:${entryType}:${amount}`) }));

console.log(JSON.stringify({
  schemaVersion: "truthpass.sensor-protocol.v1",
  mode: "demo/synthetic",
  batchId,
  telemetry,
  quality,
  profit,
  chainAnchorPayload: {
    batchId,
    evidenceRoot,
    qualityHash: sha256(canonical(quality)),
    profitRoot: merkleRoot(profit.map((item) => item.evidenceHash)),
    note: "Raw telemetry remains off-chain; periodic roots are anchored on BOT Chain 677.",
  },
}, null, 2));
