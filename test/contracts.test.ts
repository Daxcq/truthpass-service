import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import solc from "solc";

function compile(name: string) {
  const source = fs.readFileSync(`contracts/${name}.sol`, "utf8");
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: "Solidity",
    sources: { [`${name}.sol`]: { content: source } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  })));
  const errors = (output.errors ?? []).filter((item: { severity: string }) => item.severity === "error");
  assert.deepEqual(errors, []);
  const contract = output.contracts?.[`${name}.sol`]?.[name];
  assert.ok(contract?.abi);
  assert.match(contract.evm.bytecode.object, /^[0-9a-f]+$/i);
  return contract.abi as Array<{ type: string; name?: string }>;
}

test("consumer gateway contract exposes self-service wallet methods", () => {
  const abi = compile("TruthPassConsumerGateway");
  const functions = abi.filter((item) => item.type === "function").map((item) => item.name);
  assert.deepEqual(functions.sort(), ["anchor", "anchorDomain", "chainId", "consumerCommitment", "disputeOwner", "purchaseOwner", "raiseDispute", "recordContribution", "recordPurchase"].sort());
});

test("audit escrow contract exposes agent verification and settlement methods", () => {
  const abi = compile("TruthPassAuditEscrow");
  const functions = abi.filter((item) => item.type === "function").map((item) => item.name);
  for (const name of ["openChallenge", "submitAuditFinding", "approveAuditFinding", "resolveChallenge", "fundTargetBond", "fundRewardPool"]) {
    assert.ok(functions.includes(name), `missing ${name}`);
  }
  const events = abi.filter((item) => item.type === "event").map((item) => item.name);
  for (const name of ["ChallengeOpened", "AuditFindingSubmitted", "ChallengeResolved", "ChallengeRewardPaid", "ChallengeStakeSlashed"]) {
    assert.ok(events.includes(name), `missing ${name}`);
  }
});
