/**
 * One-time SOL → USDC provisioning swap (memo §9 Phase 2): funds the live
 * cash leg from the spare wallet's SOL while keeping the fee reserve. Kept
 * deliberately SEPARATE from strategy trading — this is an operator action.
 *
 * Usage:
 *   npm run autopilot:provision -- --sol 0.2          # quote + simulate ONLY
 *   npm run autopilot:provision -- --sol 0.2 --send   # actually broadcast
 *
 * Guards, all hard:
 *   - refuses without a provisioned wallet
 *   - refuses amounts that would leave less than the reserve floor + fee
 *   - refuses amounts above 0.45 SOL (sanity bound for a spare wallet)
 *   - simulates before ANY send; a failed simulation never broadcasts
 *   - --send is the only path that broadcasts; default is always dry
 */

import { Connection, PublicKey } from "@solana/web3.js";

import { guardedConnectionFetch } from "../src/helius/firewall";
import { keypairFromSecret, liveReadiness } from "../src/autopilot/live";
import { buildSignedSwap, confirmSignature } from "../src/autopilot/live-executor";
import { autopilotStore, DEFAULT_AUTOPILOT_CAPS } from "../src/autopilot/store";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const MAX_PROVISION_SOL = 0.45;
const EST_TX_FEE_SOL = 0.001;

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

async function main(): Promise<void> {
  const amountSol = Number(argValue("--sol"));
  const send = process.argv.includes("--send");
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    console.error("Usage: npm run autopilot:provision -- --sol <amount> [--send]");
    process.exit(1);
  }
  if (amountSol > MAX_PROVISION_SOL) {
    console.error(`REFUSED: ${amountSol} SOL exceeds the ${MAX_PROVISION_SOL} SOL provisioning bound.`);
    process.exit(1);
  }

  const readiness = liveReadiness();
  const keypair = keypairFromSecret(process.env.AUTOPILOT_WALLET_SECRET);
  if (!keypair || !readiness.wallet_pubkey) {
    console.error("REFUSED: no wallet in AUTOPILOT_WALLET_SECRET.");
    process.exit(1);
  }
  console.log(`wallet:   ${readiness.wallet_pubkey}`);
  console.log(`rpc:      ${new URL(readiness.rpc_url).host}`);
  console.log(`mode:     ${send ? "SEND (will broadcast!)" : "dry run (simulate only)"}`);

  const connection = new Connection(readiness.rpc_url, {
    commitment: "confirmed",
    fetch: guardedConnectionFetch("autopilot-provision") as typeof fetch,
  });
  const lamports = await connection.getBalance(new PublicKey(readiness.wallet_pubkey));
  const balanceSol = lamports / 1e9;
  const reserve = autopilotStore().botState().caps.reserve_floor_sol ?? DEFAULT_AUTOPILOT_CAPS.reserve_floor_sol;
  console.log(`balance:  ${balanceSol.toFixed(4)} SOL (reserve floor ${reserve} SOL)`);
  if (balanceSol - amountSol < reserve + EST_TX_FEE_SOL) {
    console.error(
      `REFUSED: swapping ${amountSol} SOL would leave ${(balanceSol - amountSol).toFixed(4)} SOL, under the ${reserve} reserve + fee headroom.`,
    );
    process.exit(1);
  }

  const built = await buildSignedSwap(
    { action: "sell", mint: SOL_MINT, symbol: "SOL", notional_usd: 0, qty: amountSol },
    keypair,
  );
  if (!built.ok) {
    console.error(`FAILED at build: ${built.error}`);
    process.exit(1);
  }
  const { plan, transaction } = built.built;
  const usdcOut = plan.out_amount_raw / 1e6;
  console.log(
    `quote:    ${amountSol} SOL → ${usdcOut.toFixed(4)} USDC ($${plan.effective_price_usd.toFixed(4)}/SOL, impact ${plan.price_impact_pct?.toFixed(4) ?? "?"}%, via ${plan.route_labels.join(">") || "route"})`,
  );

  const simulation = await connection.simulateTransaction(transaction, { commitment: "confirmed" });
  if (simulation.value.err !== null) {
    console.error(`FAILED simulation: ${JSON.stringify(simulation.value.err)} — nothing was sent.`);
    process.exit(1);
  }
  console.log(`simulate: OK (${simulation.value.unitsConsumed ?? "?"} compute units)`);

  if (!send) {
    console.log("DRY RUN COMPLETE — nothing was broadcast. Re-run with --send to execute.");
    return;
  }

  const signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 3 });
  console.log(`sent:     ${signature}`);
  const confirmed = await confirmSignature(connection, signature, 90_000);
  if (!confirmed.ok) {
    console.error(`FAILED: ${confirmed.error} — check the signature on a Solana explorer before retrying.`);
    process.exit(1);
  }
  autopilotStore().appendActivity(
    "provision",
    `Provisioning swap confirmed: ${amountSol} SOL → ~${usdcOut.toFixed(2)} USDC (sig ${signature.slice(0, 16)}…).`,
  );
  console.log(`CONFIRMED: ${amountSol} SOL → ~${usdcOut.toFixed(2)} USDC. The live cash leg is funded.`);
}

void main();
