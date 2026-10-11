import Link from "next/link";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AppShell } from "@/components/app-shell";
import { ReviewerEvidencePanel } from "@/components/reviewer-evidence-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reviewCapabilitySections } from "@/src/product/capabilities";
import { autopilotStore } from "@/src/autopilot/store";
import { safeWeatherResearchReport } from "@/src/polymarket/weather-research";
import { safeForecastRevisionReport } from "@/src/polymarket/forecast-revision";
import { safeRawFeedReport } from "@/src/polymarket/raw-feed-revision";

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
  const weather = safeWeatherResearchReport();
  const p7 = safeForecastRevisionReport();
  const p8 = safeRawFeedReport();
  const mlEligible = reality.cusumSpanDays >= 28 && reality.latestModelPassed && reality.latestModelCompliant && reality.approvedModel === reality.latestModelId;

  return (
    <AppShell>
      <main className="grid w-full gap-6">
        <header className="space-y-2">
          <p className="mm-eyebrow">Honest status</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">What works today</h1>
          <p className="hidden max-w-3xl text-sm leading-6 text-on-surface-variant sm:block">
            What is real, what runs on sample data, what needs a key, and what is not built yet. Paper results and replay results are evidence—not claims of future profit.
          </p>
          <p className="flex flex-wrap gap-1.5">
            {statusCounts().map(([status, count]) => (
              <Badge key={status} variant="outline">
                {count} {statusLabel[status].toLowerCase()}
              </Badge>
            ))}
          </p>
        </header>
        <section aria-labelledby="capability-truth" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="capability-truth" className="font-display text-xl font-semibold text-on-surface">By feature</h2>
              <p className="text-xs text-outline">Review credentials never include private keys, seed phrases, or wallet authority.</p>
            </div>
            <Link href="/settings#health" className="text-sm font-semibold text-violet hover:text-tertiary">Live system health</Link>
          </div>
          {/* One row per feature: status at a glance, the proof one tap away. */}
          <ul className="mm-panel divide-y divide-outline-variant/30 overflow-hidden">
            {reviewCapabilitySections.map((section) => (
              <li key={section.id}>
                <details className="group">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 marker:hidden [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{section.title}</span>
                    <Badge variant="outline" className="shrink-0">{statusLabel[section.status]}</Badge>
                    <span aria-hidden="true" className="shrink-0 text-xs text-outline transition group-open:rotate-90">›</span>
                  </summary>
                  <div className="space-y-2 px-4 pb-4 text-sm leading-5 text-on-surface-variant">
                    <p>{section.summary}</p>
                    <ul className="list-disc space-y-1 pl-5">
                      {section.items.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
                    </ul>
                    <p className="text-xs text-outline"><span className="font-semibold">Review access:</span> {section.reviewCredential}</p>
                    <p className="text-xs text-outline">Where: {section.userVisibleSurface} · Evidence: {section.evidenceEndpoint}</p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="lab-internals" className="space-y-3">
          <div>
            <h2 id="lab-internals" className="font-display text-xl font-semibold text-on-surface">Research lab internals</h2>
            <p className="text-sm text-on-surface-variant">Technical evidence for the Web3 and Polymarket labs. Nothing here can place a trade.</p>
          </div>
          <LabSection title="Web3 strategy and ML status">
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
              Local bot-control POSTs require a loopback Host and an exact loopback Origin, the development server binds to <code>127.0.0.1</code>, and cap edits cannot weaken any of the six defaults. Remote requests require configured operator or viewer credentials; viewer mutations are blocked, and remote operator mutations require an exact matching Origin. Bot-control routes keep their stricter loopback rule, so an SSH tunnel remains required to change runtime authority.
            </p>
            {reality.mode === "off" ? (
              <p className="md:col-span-2 font-semibold text-caution">
                Paper evidence clocks are paused because mode is off. The detached CEX-gap scout continues measuring;
                CUSUM, Bar Portion, forward-label, and paper-promotion clocks require an explicit operator switch to paper mode.
              </p>
            ) : null}
          </CardContent>
        </Card>

          </LabSection>
          <LabSection title="Polymarket weather research">
        <Card className="border-sky-400/25 bg-sky-400/[0.035]">
          <CardHeader className="p-5 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle as="h2" className="text-lg">Polymarket weather research truth</CardTitle>
              <Badge variant="outline" className="border-violet/30 text-violet">Shadow only</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 pt-2 text-sm leading-6 text-on-surface-variant md:grid-cols-2">
            <div>
              <p className="font-semibold text-on-surface">What is working</p>
              <p>Immutable local snapshots store audited rules, station metadata, forecast members, source hashes, observations, and market resolutions. Historical resolutions are backfilled only when one final winning bucket is unambiguous.</p>
            </div>
            <div>
              <p className="font-semibold text-on-surface">What is not proven</p>
              <p>Current ensemble captures lack a stable issuance identifier and are excluded from calibration. No historical forecast is reconstructed from outcomes, and no station-observation backfill is presented as settlement truth.</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-outline-variant/30 p-3 md:col-span-2 md:grid-cols-6">
              <dt>Rule snapshots</dt><dd className="font-semibold text-on-surface">{weather.counts.rule_snapshots}</dd>
              <dt>Forecast runs</dt><dd className="font-semibold text-on-surface">{weather.counts.forecast_runs}</dd>
              <dt>Qualified runs</dt><dd className="font-semibold text-on-surface">{weather.counts.complete_forecast_runs}</dd>
              <dt>Resolutions</dt><dd className="font-semibold text-on-surface">{weather.counts.resolutions}</dd>
              <dt>Held-out cases</dt><dd className="font-semibold text-on-surface">{weather.counts.heldout_cases}</dd>
              <dt>Evidence gate</dt><dd className="font-semibold text-on-surface">{weather.evidence_gate.passed ? "Passed; not promoted" : "Insufficient"}</dd>
            </dl>
            <p className="md:col-span-2">
              {weather.detail} The evaluator uses only prior cases for each held-out date and compares station/kind climatology, raw ensemble frequency, and a simple EMOS calibration with Brier and CRPS scores. This database cannot enable paper or live execution.
            </p>
          </CardContent>
        </Card>

          </LabSection>
          <LabSection title="P7 weather forecast-revision lag">
        <Card className="border-sky-400/25 bg-sky-400/[0.035]">
          <CardHeader className="p-5 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle as="h2" className="text-lg">Forecast-revision lag truth</CardTitle>
              <Badge variant="outline" className="border-violet/30 text-violet">{p7.enabled ? "Shadow only" : "Off"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 pt-2 text-sm leading-6 text-on-surface-variant md:grid-cols-2">
            <div>
              <p className="font-semibold text-on-surface">What is working</p>
              <p>Each new ECMWF HRES and GFS run is read by its exact run time from Open-Meteo and compared with the run before it at the market&apos;s NOAA or Wunderground station. A move of 0.5 °C or more records a $25 paper fill at the live ask for the bucket one step toward the new forecast, a matched control from the same run, and order-book snapshots 5, 15, and 60 minutes later.</p>
            </div>
            <div>
              <p className="font-semibold text-on-surface">What is not proven</p>
              <p>Paper fills live only in the P7 research ledger and never reach the paper account or an order route. The historical replay uses price history without book depth, so its fills are optimistic. A passed gate would only start a human review; live trading stays locked.</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-outline-variant/30 p-3 md:col-span-2 md:grid-cols-6">
              <dt>Live runs</dt><dd className="font-semibold text-on-surface">{p7.runs.reduce((sum, run) => sum + run.live_runs, 0)}</dd>
              <dt>Revisions</dt><dd className="font-semibold text-on-surface">{p7.summary.signals}</dd>
              <dt>Paper fills</dt><dd className="font-semibold text-on-surface">{p7.summary.signals_filled}</dd>
              <dt>Controls</dt><dd className="font-semibold text-on-surface">{p7.summary.controls_filled}</dd>
              <dt>Graded</dt><dd className="font-semibold text-on-surface">{p7.summary.graded_signals}</dd>
              <dt>Evidence gate</dt><dd className="font-semibold text-on-surface">{p7.summary.gate.status === "measuring" ? "Measuring" : p7.summary.gate.status === "pass" ? "Passed; not promoted" : "Failed"}</dd>
            </dl>
            <p className="md:col-span-2">
              {p7.summary.gate.detail}{" "}
              {p7.replay
                ? `Latest replay (${p7.replay.created_at.slice(0, 10)}, ${p7.replay.params.days} days, ${p7.replay.params.events} markets): signal ${p7.replay.summary.pnl.signal_per_dollar ?? "n/a"} vs control ${p7.replay.summary.pnl.control_per_dollar ?? "n/a"} per $1 after fees.`
                : "No historical replay has been run (npm run p7:replay)."}
              {p7.error ? ` Ledger error: ${p7.error}` : ""}
            </p>
          </CardContent>
        </Card>

          </LabSection>
          <LabSection title="P8 raw-feed head start">
        <Card className="border-sky-400/25 bg-sky-400/[0.035]">
          <CardHeader className="p-5 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle as="h2" className="text-lg">Raw-feed head start truth</CardTitle>
              <Badge variant="outline" className="border-violet/30 text-violet">{p8.enabled ? "Shadow only" : "Off"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 pt-2 text-sm leading-6 text-on-surface-variant md:grid-cols-2">
            <div>
              <p className="font-semibold text-on-surface">What is working</p>
              <p>Every minute P8 checks NOAA NOMADS for GFS 0.25° hours and ECMWF open data for 3-hourly max/min steps, decodes the 2 m temperature fields itself, and samples each market&apos;s station. When a station&apos;s whole local day has landed it applies P7&apos;s rule against the previous raw run, then records how many minutes earlier it had the revision than Open-Meteo and the target bucket&apos;s price at that later moment.</p>
            </div>
            <div>
              <p className="font-semibold text-on-surface">What is not proven</p>
              <p>A run first seen after it was published only serves as the baseline. Raw values are the nearest 0.25° grid point, so they differ slightly from Open-Meteo&apos;s products. The producer-timing replay uses Open-Meteo values with producer timestamps and no book depth. Paper fills never reach an order route; live trading stays locked.</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-outline-variant/30 p-3 md:col-span-2 md:grid-cols-6">
              <dt>Raw runs</dt><dd className="font-semibold text-on-surface">{p8.feeds.reduce((sum, feed) => sum + feed.live_runs, 0)}</dd>
              <dt>Revisions</dt><dd className="font-semibold text-on-surface">{p8.summary.signals}</dd>
              <dt>Paper fills</dt><dd className="font-semibold text-on-surface">{p8.summary.signals_filled}</dd>
              <dt>Controls</dt><dd className="font-semibold text-on-surface">{p8.summary.controls_filled}</dd>
              <dt>Head starts</dt><dd className="font-semibold text-on-surface">{p8.feeds.reduce((sum, feed) => sum + feed.head_start.compared, 0)}</dd>
              <dt>Evidence gate</dt><dd className="font-semibold text-on-surface">{p8.summary.gate.status === "measuring" ? "Measuring" : p8.summary.gate.status === "pass" ? "Passed; not promoted" : "Failed"}</dd>
            </dl>
            <p className="md:col-span-2">
              {p8.summary.gate.detail}{" "}
              {p8.feeds.filter((feed) => feed.head_start.median_head_start_min !== null).map((feed) => `${feed.label}: median head start ${feed.head_start.median_head_start_min} min.`).join(" ")}{" "}
              {p8.replay
                ? `Latest producer-timing replay (${p8.replay.created_at.slice(0, 10)}, ${p8.replay.params.days} days): signal ${p8.replay.summary.pnl.signal_per_dollar ?? "n/a"} vs control ${p8.replay.summary.pnl.control_per_dollar ?? "n/a"} per $1 after fees.`
                : "No producer-timing replay has been run (npm run p7:replay -- --timing raw)."}
              {p8.error ? ` Ledger error: ${p8.error}` : ""}
            </p>
          </CardContent>
        </Card>

          </LabSection>
        </section>

        {/* Reviewer tooling, not status: folded so the page leads with what works. */}
        <details className="group mm-panel overflow-hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-on-surface marker:hidden [&::-webkit-details-marker]:hidden">
            Walkthrough checks for reviewers
            <span aria-hidden="true" className="text-xs text-outline transition group-open:rotate-90">›</span>
          </summary>
          <div className="p-3 pt-0">
            <ReviewerEvidencePanel />
          </div>
        </details>
      </main>
    </AppShell>
  );
}

function statusCounts() {
  const counts = new Map<keyof typeof statusLabel, number>();
  for (const section of reviewCapabilitySections) counts.set(section.status, (counts.get(section.status) ?? 0) + 1);
  return [...counts.entries()];
}

function LabSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group mm-panel overflow-hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold text-on-surface marker:hidden hover:bg-surface-high/30 [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden="true" className="text-outline transition group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-outline-variant/40 p-2">{children}</div>
    </details>
  );
}
