import { CloudSun, ExternalLink, FlaskConical } from "lucide-react";

import type { PolymarketWeatherReport } from "@/src/polymarket/weather";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PolymarketWeatherPanel({ weather }: { weather: PolymarketWeatherReport }) {
  return (
    <Card className="border-sky-400/20 bg-sky-400/[0.025]">
      <CardHeader className="flex-row items-start justify-between gap-3 p-4 pb-2">
        <div>
          <CardTitle as="h2" className="flex items-center gap-2 text-base"><CloudSun className="size-4 text-sky-300" /> Weather shadow lab</CardTitle>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-on-surface-variant">
            Upcoming Polymarket daily-temperature buckets are matched to the event&apos;s stated Wunderground station. Official station coordinates feed raw ECMWF ensemble members. Nothing here can open a paper or live position.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 border-violet/30 text-violet"><FlaskConical /> Observe only</Badge>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-2">
        <p className="text-[11px] leading-4 text-outline">{weather.detail}</p>
        <section className="rounded-md border border-violet/20 bg-violet/[0.025] p-3" aria-label="Weather research evidence status">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-on-surface">Calibration evidence</span>
                <Badge variant="outline" className={weather.research.evidence_gate.passed ? "border-caution/30 text-caution" : "border-outline-variant/40 text-outline"}>
                  {weather.research.evidence_gate.passed ? "Evaluated, not promoted" : "Insufficient"}
                </Badge>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-outline">{weather.research.detail}</p>
            </div>
            <div className="flex gap-3 font-mono text-[10px] text-outline">
              <span>{weather.research.counts.forecast_runs} runs</span>
              <span>{weather.research.counts.complete_forecast_runs} qualified</span>
              <span>{weather.research.counts.resolutions} resolutions</span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
            <ResearchScore label="Climatology" score={weather.research.models.climatology} />
            <ResearchScore label="Raw ensemble" score={weather.research.models.raw_ensemble} />
            <ResearchScore label="Simple EMOS" score={weather.research.models.simple_emos} />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-caution">
            Captures without a stable model-run timestamp are saved for audit but excluded from the held-out comparison. Research status cannot enable trading.
          </p>
        </section>
        {weather.events.length === 0 ? (
          <div className="rounded-md border border-dashed border-outline-variant/35 px-4 py-5 text-center text-xs text-outline">No upcoming audited daily-temperature events are available.</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {weather.events.map((event) => (
              <article key={event.event_id} className="rounded-md border border-outline-variant/25 bg-void/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={event.forecast_status === "raw-ensemble" ? "border-sky-400/30 text-sky-300" : "text-outline"}>
                        {event.forecast_status === "raw-ensemble" ? `${event.member_count} raw members` : event.forecast_status}
                      </Badge>
                      <span className="font-mono text-[10px] text-outline">{event.station_code ?? "station unverified"}</span>
                      {event.fees_enabled ? <Badge variant="outline" className="border-caution/30 text-caution">Fees</Badge> : null}
                    </div>
                    <h3 className="mt-2 text-sm font-semibold leading-5 text-on-surface">{event.title}</h3>
                    <p className="mt-1 text-[11px] leading-4 text-outline">{event.station_name ?? event.rules_detail} · {event.bucket_count} buckets · {money(event.liquidity_usd)} liquidity</p>
                  </div>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={`https://polymarket.com/event/${event.slug}`} target="_blank" rel="noreferrer">Inspect <ExternalLink /></a>
                  </Button>
                </div>
                {event.top_bucket && event.top_bucket.raw_model_probability !== null ? (
                  <div className="mt-3 rounded-md border border-sky-400/15 bg-sky-400/[0.035] px-3 py-2 text-xs">
                    <span className="text-on-surface-variant">Most ensemble members:</span>{" "}
                    <strong className="text-on-surface">{event.top_bucket.label}</strong>{" "}
                    <span className="font-mono text-sky-300">{percent(event.top_bucket.raw_model_probability)}</span>
                    {event.top_bucket.market_yes_price !== null ? <span className="font-mono text-outline"> vs {percent(event.top_bucket.market_yes_price)} market</span> : null}
                  </div>
                ) : null}
                <p className="mt-2 text-[10px] leading-4 text-caution">{event.warning}</p>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResearchScore({ label, score }: { label: string; score: PolymarketWeatherReport["research"]["models"]["raw_ensemble"] }) {
  return (
    <div className="rounded border border-outline-variant/20 px-2 py-1.5">
      <div className="text-outline">{label}</div>
      <div className="mt-0.5 font-mono text-on-surface">
        {score.evaluated_cases > 0
          ? `Brier ${score.mean_brier_score?.toFixed(4)} · CRPS ${score.mean_crps_celsius?.toFixed(2)}°C`
          : "No held-out score"}
      </div>
    </div>
  );
}

function money(value: number) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value) : "unknown";
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
