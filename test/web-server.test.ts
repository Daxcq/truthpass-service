import test from "node:test";
import assert from "node:assert/strict";
import { createWebServer } from "../src/web-server.js";

test("wallet prepare uses verified mainnet metadata when RPC is unavailable", async () => {
  const server = createWebServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/wallet/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "evidence",
        wallet: "0x2eBd8467735EE3534be6add92f3D7231BA693c08",
        batchId: "FO-2026-001",
        clientNonce: "web-server-test",
      }),
    });
    const body = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(body.network, "bot-mainnet");
    assert.equal(body.chainId, 677);
    assert.equal(body.contractAddress, "0x0033462bee153cb9DF12b5c447b9C282DbfbE877");
    assert.equal((body.transaction as Record<string, unknown>).chainId, 677);
    assert.match(String((body.transaction as Record<string, unknown>).data), /^0x05915a75/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("agent manifest advertises the forwarded public origin and wallet action", async () => {
  const server = createWebServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/agent/manifest`, {
      headers: {
        host: "internal.example.test",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "demo.example.test",
      },
    });
    const body = await response.json() as Record<string, any>;
    assert.equal(response.status, 200);
    assert.equal(body.publicUrl, "https://demo.example.test");
    assert.equal(body.endpoints.walletPrepare, "https://demo.example.test/api/wallet/prepare");
    assert.deepEqual(body.cli.walletActions, ["evidence", "verification", "purchase", "contribution", "dispute"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("consumer wallet actions target the configured gateway", async () => {
  const previous = process.env.TRUTHPASS_CONSUMER_GATEWAY_ADDRESS;
  process.env.TRUTHPASS_CONSUMER_GATEWAY_ADDRESS = "0x2222222222222222222222222222222222222222";
  const server = createWebServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/wallet/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "purchase",
        wallet: "0x3333333333333333333333333333333333333333",
        batchId: "FO-2026-001",
        clientNonce: "gateway-test",
      }),
    });
    const body = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(body.contractAddress, "0x2222222222222222222222222222222222222222");
    assert.equal(body.requiredRole, "CONSUMER_SELF_SERVICE");
    assert.equal(body.gateway, true);
    assert.match(String((body.transaction as Record<string, unknown>).data), /^0x[0-9a-f]{8}/i);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previous === undefined) delete process.env.TRUTHPASS_CONSUMER_GATEWAY_ADDRESS;
    else process.env.TRUTHPASS_CONSUMER_GATEWAY_ADDRESS = previous;
  }
});
