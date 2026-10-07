import { createPublicKey, verify } from "node:crypto";
import { canonicalJson } from "../data/canonical.js";
import type { EvidenceRecord } from "../data/model.js";

export type TrustedIssuerKeyResolver = (issuerId: string, keyId: string) => string | undefined;

export function evidenceSigningPayload(evidence: Pick<EvidenceRecord, "schemaVersion" | "evidenceId" | "batchId" | "kind" | "issuerId" | "sourceKind" | "occurredAt" | "payload" | "dataMode">, keyId: string): string {
  return canonicalJson({
    schemaVersion: evidence.schemaVersion,
    evidenceId: evidence.evidenceId,
    batchId: evidence.batchId,
    kind: evidence.kind,
    issuerId: evidence.issuerId,
    sourceKind: evidence.sourceKind,
    occurredAt: evidence.occurredAt,
    payload: evidence.payload,
    dataMode: evidence.dataMode,
    keyId,
  });
}

export function verifyEvidenceAttestation(evidence: EvidenceRecord, resolveTrustedKey: TrustedIssuerKeyResolver): boolean {
  const attestation = evidence.attestation;
  if (!attestation || attestation.algorithm !== "Ed25519" || !attestation.keyId) return false;
  const publicKey = resolveTrustedKey(evidence.issuerId, attestation.keyId);
  if (!publicKey) return false;

  try {
    return verify(
      null,
      Buffer.from(evidenceSigningPayload(evidence, attestation.keyId)),
      createPublicKey(publicKey),
      Buffer.from(attestation.signature, "base64"),
    );
  } catch {
    return false;
  }
}
