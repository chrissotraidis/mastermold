import Link from "next/link";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AppShell } from "@/components/app-shell";
import { ReviewerEvidencePanel } from "@/components/reviewer-evidence-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reviewCapabilitySections } from "@/src/product/capabilities";
import { autopilotStore } from "@/src/autopilot/store";

export const dynamic = "force-dynamic";

const statusLabel = {
  working: "Working",
  sample: "Seeded sample",
  "sample-or-local": "Sample or local",
  "credential-gated": "Credential-gated",
  "local-only": "Local only",
  missing: "Missing",
} as const;

function strategyReality() {
  try {
    const store = autopilotStore();
    const snapshots = store.candidateSnapshots(2_000);
    const cusumRange = store.v3StrategyEvidenceRange("cusum_tb");
    const spanDays = cusumRange
      ? Math.max(0, (Date.parse(cusumRange.latest_ts) - Date.parse(cusumRange.first_ts)) / 86_400_000)
      : 0;
    const approvalPath = join(process.cwd(), "engine", "out", "ml", "APPROVED_MODEL");
    const approvedModel = existsSync(approvalPath) ? readFileSync(approvalPath, "utf8").trim() : "";
    const resultPath = join(process.cwd(), "engine", "out", "ml", "training-result.json");
    const latestModel = existsSync(resultPath)
      ? JSON.parse(readFileSync(resultPath, "utf8")) as { model_id?: string; data_compliant?: boolean; criterion_passed?: boolean; heldout_events?: number }
      : null;
    return {
      snapshots: snapshots.length,
      cusumSnapshots: snapshots.filter((row) => row.strategy_id === "cusum_tb").length,
      cusumSpanDays: spanDays,
      approvedModel: approvedModel || null,
      latestModelId: latestModel?.model_id ?? null,
      latestModelCompliant: latestModel?.data_compliant ?? false,
      latestModelPassed: latestModel?.criterion_passed ?? false,
      latestHeldoutEvents: latestModel?.heldout_events ?? 0,
      mode: store.botState().mode,
      killSwitch: store.botState().kill_switch,
    };
  } catch {
    return { snapshots: 0, cusumSnapshots: 0, cusumSpanDays: 0, approvedModel: null, latestModelId: null, latestModelCompliant: false, latestModelPassed: false, latestHeldoutEvents: 0, mode: "unavailable", killSwitch: true };
  }
}

export default function ReviewPage() {
  const reality = strategyReality();
  const mlEligible = reality.cusumSpanDays >= 28 && reality.latestModelPassed && reality.latestModelCompliant && reality.approvedModel === reality.latestModelId;

  return (
    <AppShell>
      <main className="mx-auto grid w-full max-w-5xl gap-4">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-on-surface">Build truth and review readiness</h1>
            <Badge variant="outline">Local build</Badge>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-on-surface-variant">
            This is the app-visible truth surface: what works, what is seeded or local, what needs credentials,
            and what is still missing. Paper results and replay results are evidence—not claims of future profit.
          </p>
        </header>

        <Card className="border-caution/35 bg-caution/[0.045]">
          <CardHeader className="p-5 pb-2">
            <CardTitle as="h2" className="text-lg">Strategy expansion status</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 pt-2 text-sm leading-6 text-on-surface-variant md:grid-cols-2">
            <div>
              <p className="font-semibold text-on-surface">Implemented and locally tested</p>
              <p>
                Quick wins, Tier B rotation, quote-derived costs, CUSUM/triple barriers, Bar Portion,
                deterministic replay/promotion/demotion, durable CEX-week aggregation, and CEX-gap/Drift shadow measurement.
              </p>
            </div>
            <div>
              <p className="font-semibold text-on-surface">ML pipeline: built, activation held</p>
              <p>
                TS/Python parity, Parquet acquisition, 33 features, purged walk-forward training,
                ResNet–LSTM inference, model cards, and safe degradation are present. Exact event requests remain pending across ticks for up to 60 seconds rather than requiring an impossible same-tick reply. ML influence remains {mlEligible ? "eligible by local evidence gates" : "disabled"}.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-outline-variant/30 p-3 md:col-span-2 md:grid-cols-6">
              <dt>Candidates retained</dt><dd className="font-semibold text-on-surface">{reality.snapshots}</dd>
              <dt>CUSUM retained</dt><dd className="font-semibold text-on-surface">{reality.cusumSnapshots}</dd>
              <dt>CUSUM span</dt><dd className="font-semibold text-on-surface">{reality.cusumSpanDays.toFixed(1)} days</dd>
              <dt>Latest ML model</dt><dd className="font-semibold text-on-surface">{reality.latestModelId ? `${reality.latestModelId} · ${reality.latestModelPassed ? "passed" : "rejected"}` : "None"}</dd>
              <dt>Held-out ML events</dt><dd className="font-semibold text-on-surface">{reality.latestHeldoutEvents}</dd>
              <dt>Approved ML model</dt><dd className="font-semibold text-on-surface">{reality.approvedModel ?? "None"}</dd>
              <dt>Bot mode</dt><dd className="font-semibold text-on-surface">{reality.mode}</dd>
              <dt>Kill switch</dt><dd className="font-semibold text-on-surface">{reality.killSwitch ? "Engaged/unavailable" : "Released"}</dd>
            </dl>
            <p className="md:col-span-2">
              The latest model is {reality.latestModelCompliant ? "data-contract compliant" : "not data-contract compliant"} and {reality.latestModelPassed ? "passed" : "failed"} the frozen held-out criterion. ML cannot activate until CUSUM has at least 28 independently persisted shadow days and an operator
              reviews a real model card and writes its exact content-hash ID to <code>engine/out/ml/APPROVED_MODEL</code>.
              Fixture models are labeled non-deployable. Python never creates orders; TypeScript still owns filters,
              EV routing, policy, promotion, and execution.
            </p>
            <p className="md:col-span-2">
              <span className="font-semibold text-on-surface">Operator health check:</span>{" "}
              <code>bun run paper:check</code> reads the local health endpoint and durable paper store, then exits
              nonzero for unexpected live mode, default-cap drift, stale daemon/evidence, or recent runtime errors.
              It cannot change mode, release the kill switch, edit caps, approve models, or execute a trade.
            </p>
            <p className="md:col-span-2">
              <span className="font-semibold text-on-surface">Evidence correction:</span>{" "}
              the 2.0 CUSUM events/day figure came from a deterministic fixture, not live markets. The first reviewed paper sample was roughly 9.8/day/mint—above the written 0.5–5 band. The corrected daemon now stores every event durably and warns after six observed hours; it never retunes thresholds automatically. Quote-derived fill rehearsals are also excluded from self-comparison slippage estimates.
            </p>
            <p className="md:col-span-2">
              Local bot-control POSTs require a loopback Host and an exact loopback Origin, the development server binds to <code>127.0.0.1</code>, and cap edits cannot weaken any of the six defaults. Review access does not grant live-wallet or remote-control authority.
            </p>
            {reality.mode === "off" ? (
              <p className="md:col-span-2 font-semibold text-caution">
                Paper evidence clocks are paused because mode is off. The detached CEX-gap scout continues measuring;
                CUSUM, Bar Portion, forward-label, and paper-promotion clocks require an explicit operator switch to paper mode.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <section aria-labelledby="capability-truth" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="capability-truth" className="font-display text-xl font-semibold text-on-surface">Capability truth</h2>
              <p className="text-sm text-on-surface-variant">Review credentials never include private keys, seed phrases, or wallet authority.</p>
            </div>
            <Link href="/settings#health" className="text-sm font-semibold text-violet hover:text-tertiary">Open live system health</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {reviewCapabilitySections.map((section) => (
              <Card key={section.id} className="border-outline-variant/30">
                <CardHeader className="space-y-2 p-4 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle as="h3" className="text-base">{section.title}</CardTitle>
                    <Badge variant="outline">{statusLabel[section.status]}</Badge>
                  </div>
                  <p className="text-sm leading-5 text-on-surface-variant">{section.summary}</p>
                </CardHeader>
                <CardContent className="space-y-2 p-4 pt-1 text-sm leading-5 text-on-surface-variant">
                  <p><span className="font-semibold text-on-surface">Review access:</span> {section.reviewCredential}</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {section.items.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                  <p className="text-xs text-outline">Surface: {section.userVisibleSurface} · Evidence: {section.evidenceEndpoint}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <ReviewerEvidencePanel />
      </main>
    </AppShell>
  );
}
