/**
 * Live-executor drill: prove the whole quote → build → sign → SIMULATE
 * pipeline against mainnet with the provisioned wallet, without ever
 * broadcasting. Run with `npm run autopilot:drill`.
 *
 * The drill leg is SOL→USDC for a tiny amount — the direction the wallet can
 * actually fund today (it holds SOL), and the same direction as the eventual
 * cash-leg provisioning swap. Read-only against the chain: simulation only.
 */

import { Connection, PublicKey } from "@solana/web3.js";

import { buildSignedSwap, USDC_MINT } from "../src/autopilot/live-executor";
import { keypairFromSecret, liveReadiness } from "../src/autopilot/live";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const DRILL_SOL = 0.01;

async function main(): Promise<void> {
  const readiness = liveReadiness();
  console.log(`wallet provisioned: ${readiness.wallet_provisioned}`);
  console.log(`wallet pubkey:      ${readiness.wallet_pubkey ?? "—"}`);
  console.log(`rpc host:           ${new URL(readiness.rpc_url).host}`);
  if (!readiness.wallet_provisioned || !readiness.wallet_pubkey) {
    console.error("DRILL BLOCKED: no wallet in AUTOPILOT_WALLET_SECRET.");
    process.exit(1);
  }
  const keypair = keypairFromSecret(process.env.AUTOPILOT_WALLET_SECRET);
  if (!keypair) throw new Error("unreachable: readiness said provisioned");

  const connection = new Connection(readiness.rpc_url, "confirmed");
  const lamports = await connection.getBalance(new PublicKey(readiness.wallet_pubkey));
  console.log(`balance:            ${(lamports / 1e9).toFixed(4)} SOL`);

  // A "sell" of SOL for USDC exercises the exact executor build path.
  const built = await buildSignedSwap(
    { action: "sell", mint: SOL_MINT, symbol: "SOL", notional_usd: 0, qty: DRILL_SOL },
    keypair,
  );
  if (!built.ok) {
    console.error(`DRILL FAILED at build: ${built.error}`);
    process.exit(1);
  }
  const { plan, transaction } = built.built;
  console.log(`quote:              ${DRILL_SOL} SOL → ${(plan.out_amount_raw / 1e6).toFixed(4)} USDC` +
    ` (effective $${plan.effective_price_usd.toFixed(4)}/SOL, impact ${plan.price_impact_pct?.toFixed(4) ?? "?"}%, via ${plan.route_labels.join(">") || "route"})`);
  console.log(`transaction:        built and signed (${transaction.serialize().length} bytes) — NOT sent`);

  const simulation = await connection.simulateTransaction(transaction, { commitment: "confirmed" });
  if (simulation.value.err === null) {
    console.log(`simulation:         OK (${simulation.value.unitsConsumed ?? "?"} compute units) — nothing was broadcast`);
    console.log("DRILL PASSED: quote → build → sign → simulate all green.");
  } else {
    console.error(`simulation:         FAILED: ${JSON.stringify(simulation.value.err)}`);
    console.error((simulation.value.logs ?? []).slice(-5).join("\n"));
    process.exit(1);
  }
}

void main();
