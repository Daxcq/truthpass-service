#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Contract, JsonRpcProvider, Wallet, getAddress, keccak256, toUtf8Bytes } from "ethers";
import { configureEthersNetwork } from "./ethers-network.mjs";

const ROOT = process.cwd();
const RPC = process.env.TRUTHPASS_MAINNET_RPC_URL || "https://rpc.botchain.ai";
const CHAIN_ID = 677n;
const CONFIRM = "GRANT_AUDIT_ESCROW_ROLES_TO_BOTCHAIN_MAINNET";
const ROLE_NAMES = ["AUDIT_AGENT_ROLE", "VERIFIER_ROLE", "ARBITER_ROLE", "TREASURY_ROLE"];
const ABI = [
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function grantRole(bytes32 role, address account)",
];

function fail(message) { throw new Error(`[grant-audit-escrow-mainnet-roles] ${message}`); }
function address(value, name) {
  if (!value) fail(`${name} is required`);
  try { return getAddress(value); } catch { fail(`${name} is not a valid EVM address`); }
}

async function main() {
  configureEthersNetwork();
  const dryRun = process.argv.includes("--dry-run");
  const confirmed = process.argv.includes("--confirm") && process.env.TRUTHPASS_AUDIT_ROLE_CONFIRM === CONFIRM;
  if (!dryRun && !confirmed) fail(`live role grants require --confirm and TRUTHPASS_AUDIT_ROLE_CONFIRM=${CONFIRM}`);

  const deployment = JSON.parse(await fs.readFile(path.join(ROOT, "config", "bot-chain-mainnet.audit-escrow.json"), "utf8"));
  const escrow = address(process.env.TRUTHPASS_AUDIT_ESCROW_ADDRESS || deployment.auditEscrow?.address, "TRUTHPASS_AUDIT_ESCROW_ADDRESS");
  const deployer = address(process.env.TRUTHPASS_DEPLOYER_ADDRESS, "TRUTHPASS_DEPLOYER_ADDRESS");
  const privateKey = process.env.TRUTHPASS_DEPLOYER_PRIVATE_KEY;
  if (!dryRun && !privateKey) fail("TRUTHPASS_DEPLOYER_PRIVATE_KEY is required for live role grants");
  if (privateKey && new Wallet(privateKey).address.toLowerCase() !== deployer.toLowerCase()) fail("deployer address does not match private key");

  const provider = new JsonRpcProvider(RPC, Number(CHAIN_ID), { staticNetwork: true, batchMaxCount: 1 });
  if ((await provider.getNetwork()).chainId !== CHAIN_ID) fail("RPC network mismatch; expected Chain ID 677");
  if ((await provider.getCode(escrow)) === "0x") fail(`no contract bytecode found at ${escrow}`);
  const contract = new Contract(escrow, ABI, provider);
  const singleWallet = process.env.TRUTHPASS_ALLOW_SINGLE_WALLET_MAINNET === "true";
  const plan = [];
  for (const name of ROLE_NAMES) {
    const configured = process.env[`TRUTHPASS_AUDIT_ROLE_${name}`];
    if (!configured && !singleWallet) fail(`TRUTHPASS_AUDIT_ROLE_${name} is required (or set TRUTHPASS_ALLOW_SINGLE_WALLET_MAINNET=true)`);
    const target = address(configured || deployer, `TRUTHPASS_AUDIT_ROLE_${name}`);
    const role = keccak256(toUtf8Bytes(name));
    const alreadyGranted = await contract.hasRole(role, target);
    plan.push({ name, role, target, alreadyGranted, status: alreadyGranted ? "already_granted" : "pending" });
  }
  if (dryRun) {
    console.log(JSON.stringify({ schemaVersion: "truthpass.audit-escrow.role-preflight.v1", status: "dry_run", network: "bot-mainnet", chainId: Number(CHAIN_ID), escrowAddress: escrow, deployerAddress: deployer, singleWalletMode: singleWallet, plan }, null, 2));
    return;
  }
  const signer = new Wallet(privateKey, provider);
  const writable = new Contract(escrow, ABI, signer);
  const receipts = [];
  for (const item of plan.filter((entry) => entry.status === "pending")) {
    const tx = await writable.grantRole(item.role, item.target);
    const receipt = await tx.wait(2);
    if (!receipt || receipt.status !== 1) fail(`role grant failed for ${item.name}: ${tx.hash}`);
    if (!(await contract.hasRole(item.role, item.target))) fail(`role readback failed for ${item.name}`);
    receipts.push({ name: item.name, target: item.target, txHash: tx.hash, status: "verified" });
  }
  const metadata = { schemaVersion: "truthpass.audit-escrow.roles.v1", status: "roles_receipt_verified", network: "bot-mainnet", chainId: Number(CHAIN_ID), escrowAddress: escrow, deployerAddress: deployer, singleWalletMode: singleWallet, receipts, note: "Public role metadata only. Private keys stay outside Git." };
  const output = path.join(ROOT, process.env.TRUTHPASS_AUDIT_ROLE_OUTPUT || "config/bot-chain-mainnet.audit-escrow.roles.json");
  await fs.writeFile(output, JSON.stringify(metadata, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(metadata, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
