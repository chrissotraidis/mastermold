/// <reference types="bun" />

/**
 * Live-wallet provisioning slice: base58/JSON secret parsing and the
 * readiness view the go-live gate's wallet check reads. No real secrets —
 * tests generate throwaway keypairs in memory.
 */

import { describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";

import { decodeBase58, keypairFromSecret, liveReadiness } from "../src/autopilot/live";

describe("base58 decode", () => {
  test("GIVEN known vectors THEN bytes round-trip", () => {
    // "StV1DL6CwTryKyV" is the canonical encoding of ascii "hello world".
    expect(new TextDecoder().decode(decodeBase58("StV1DL6CwTryKyV")!)).toBe("hello world");
    // Leading '1's are leading zero bytes.
    expect(Array.from(decodeBase58("11233QC4")!)).toEqual([0, 0, 40, 127, 180, 205]);
  });

  test("GIVEN invalid characters THEN null, not a throw", () => {
    expect(decodeBase58("0OIl")).toBeNull(); // characters excluded from the alphabet
    expect(decodeBase58("")).toBeNull();
  });
});

describe("keypairFromSecret", () => {
  test("GIVEN a solana-keygen JSON array THEN the keypair parses with the right pubkey", () => {
    const keypair = Keypair.generate();
    const parsed = keypairFromSecret(JSON.stringify(Array.from(keypair.secretKey)));
    expect(parsed?.publicKey.toBase58()).toBe(keypair.publicKey.toBase58());
  });

  test("GIVEN junk THEN null in every failure shape", () => {
    expect(keypairFromSecret(undefined)).toBeNull();
    expect(keypairFromSecret("")).toBeNull();
    expect(keypairFromSecret("not-a-key")).toBeNull();
    expect(keypairFromSecret("[1,2,3]")).toBeNull(); // wrong length
    expect(keypairFromSecret("[not json")).toBeNull();
  });
});

describe("liveReadiness", () => {
  test("GIVEN no secret in env THEN not provisioned and no pubkey leaks", () => {
    const readiness = liveReadiness({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
    expect(readiness.wallet_provisioned).toBe(false);
    expect(readiness.wallet_pubkey).toBeNull();
    expect(readiness.rpc_url).toContain("mainnet");
  });

  test("GIVEN a valid secret THEN provisioned with only the PUBLIC key exposed", () => {
    const keypair = Keypair.generate();
    const readiness = liveReadiness({
      AUTOPILOT_WALLET_SECRET: JSON.stringify(Array.from(keypair.secretKey)),
      SOLANA_RPC_URL: "https://example-rpc.test",
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv);
    expect(readiness.wallet_provisioned).toBe(true);
    expect(readiness.wallet_pubkey).toBe(keypair.publicKey.toBase58());
    expect(readiness.rpc_url).toBe("https://example-rpc.test");
    expect(JSON.stringify(readiness)).not.toContain(JSON.stringify(Array.from(keypair.secretKey)).slice(1, 20));
  });
});
