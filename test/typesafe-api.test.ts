import assert from "node:assert/strict";
import test from "node:test";
import { TypesafeClient, type TypesafeRunRequest } from "../src/typesafe/api.js";

const request: TypesafeRunRequest = {
  state: { batchId: "FO-2026-001", epaDhaPercent: 78 },
  model: "jev-latest",
  questions: {
    batch_status: { type: "choice", instructions: "判断当前证据状态", choices: { verified: "已验证", partial: "部分验证" } },
    explanation: { type: "noul", instructions: "解释判断依据" },
  },
};

test("keeps the API key as an environment placeholder", async () => {
  const client = new TypesafeClient({ apiKey: "" });
  await assert.rejects(() => client.run(request), /TYPESAFE_API_KEY 未配置/);
});

test("sends the documented request shape and bearer key", async () => {
  let received: { url: string; init: RequestInit } | undefined;
  const client = new TypesafeClient({
    apiKey: "test-key",
    baseUrl: "https://example.test",
    fetchImpl: async (url, init) => {
      received = { url: String(url), init: init ?? {} };
      return new Response(JSON.stringify({ answers: { batch_status: "verified" } }), { status: 200 });
    },
  });

  const response = await client.run(request);

  assert.equal(received?.url, "https://example.test/v1/run");
  assert.equal(received?.init.headers && new Headers(received.init.headers).get("Authorization"), "Bearer test-key");
  assert.deepEqual(JSON.parse(String(received?.init.body)), request);
  assert.equal(response.answers.batch_status, "verified");
});
