import { getEngineRunHistory } from "./engine-data";
import { recordProductMetric } from "./metrics";
import { store, type ProductMetricEventRow } from "./store";

export type ForwardProofGate = {
  id: string;
  label: string;
  status: "Working locally" | "Partial" | "Missing";
  detail: string;
};

export type ForwardMeasurementContract = {
  status: "Not started" | "Running locally";
  started_at: string | null;
  min_logged_calls: number;
  min_resolved_calls: number;
  baseline: string;
  cost_policy: string;
  pass_fail_gate: string;
  note: string;
};

export type ForwardProofStatus = {
  verdict: "Trust log only" | "Measuring forward" | "Ready to measure forward";
  summary: string;
  gates: ForwardProofGate[];
  measurement: ForwardMeasurementContract;
  counts: {
    logged_calls: number;
    resolved_calls: number;
    saved_scans: number;
  };
  progress: {
    saved_calls: string;
    later_results: string;
    saved_scans: string;
    next_step: string;
  };
};

const defaultMeasurementContract = {
  min_logged_calls: 30,
  min_resolved_calls: 10,
  baseline: "Hold the visible portfolio evenly",
  cost_policy: "Paper only. Execution costs stay at zero until real broker or wallet execution exists.",
  pass_fail_gate:
    "Saved calls need enough later results and costs included before the app can say the calls beat the baseline.",
};

export function getForwardProofStatus(): ForwardProofStatus {
  const history = getEngineRunHistory();
  const measurement = getForwardMeasurementContract();
  const allLocalEntries = store().loggedJournalEntries();
  const measurementStart = measurement.status === "Running locally" ? measurement.started_at : null;
  const localEntries = filterEntriesForMeasurementWindow(allLocalEntries, measurementStart);
  const localEntryIds = new Set(localEntries.map((entry) => entry.id));
  const localOutcomes = store()
    .outcomeScores()
    .filter((score) => localEntryIds.has(score.journal_entry_id));
  const loggedBeforeOutcome = localEntries.every((entry) => {
    const outcome = localOutcomes.find((score) => score.journal_entry_id === entry.id);
    if (!outcome) return true;
    return Date.parse(entry.logged_at) <= Date.parse(outcome.resolved_at);
  });
  const loggedCalls = localEntries.length;
  const resolvedCalls = localOutcomes.length;
  const savedScans = history.length;
  const gates: ForwardProofGate[] = [
    {
      id: "pre_outcome_log",
      label: "Save calls before results",
      status: loggedBeforeOutcome && loggedCalls > 0 ? "Working locally" : "Missing",
      detail:
        loggedCalls > 0
          ? measurementStart
            ? `${loggedCalls} local ${loggedCalls === 1 ? "call" : "calls"} in this measurement window are saved before any recorded result.`
            : `${loggedCalls} local ${loggedCalls === 1 ? "call is" : "calls are"} saved before any recorded result.`
          : measurementStart
            ? "No local calls have been saved since the measurement start. Older local calls stay in the trust log but do not count here."
            : "No local calls have been saved from Today or Journal yet. Seeded/sample calls do not count as forward evidence.",
    },
    {
      id: "resolve_results",
      label: "Score later results",
      status: resolvedCalls > 0 ? "Working locally" : "Missing",
      detail:
        resolvedCalls > 0
          ? measurementStart
            ? `${resolvedCalls} measurement-window ${resolvedCalls === 1 ? "call has" : "calls have"} later results recorded.`
            : `${resolvedCalls} local ${resolvedCalls === 1 ? "call has" : "calls have"} later results recorded.`
          : measurementStart
            ? "A call saved after the measurement start needs to reach its horizon before it can be scored."
            : "A locally saved call needs to reach its horizon before it can be scored.",
    },
    {
      id: "saved_scan_history",
      label: "Keep saved-read history",
      status: savedScans > 0 ? "Partial" : "Missing",
      detail:
        savedScans > 0
          ? `${savedScans} saved ${savedScans === 1 ? "read is" : "reads are"} available for review.`
          : "No saved read history is available yet.",
    },
    {
      id: "baselines_and_costs",
      label: "Compare with baselines and costs",
      status: measurement.status === "Running locally" ? "Partial" : "Missing",
      detail:
        measurement.status === "Running locally"
          ? "A pre-written baseline, cost rule, and pass/fail gate are saved locally. Result comparison needs later outcomes."
          : "No baseline, cost rule, or pre-written pass/fail gate is saved yet.",
    },
    {
      id: "measurement_window",
      label: "Run a dated measurement window",
      status: measurement.status === "Running locally" ? "Partial" : "Missing",
      detail:
        measurement.status === "Running locally" && measurement.started_at
          ? `Measurement started locally on ${formatDate(measurement.started_at)}; waiting for enough saved calls and later results.`
          : "No dated measurement window is running.",
    },
  ];
  const readyForMeasurement =
    measurement.status === "Not started" &&
    gates.every((gate) => gate.status === "Working locally");

  return {
    verdict:
      measurement.status === "Running locally"
        ? "Measuring forward"
        : readyForMeasurement
          ? "Ready to measure forward"
          : "Trust log only",
    summary:
      measurement.status === "Running locally"
        ? "Measurement started locally. Only calls saved after the start point count, and it still needs enough later results for a baseline comparison."
        : readyForMeasurement
          ? "Local evidence is complete enough to start a dated measurement window."
          : "This is still a trust log. It needs a dated measurement window and later results before a baseline comparison means anything.",
    gates,
    measurement,
    counts: {
      logged_calls: loggedCalls,
      resolved_calls: resolvedCalls,
      saved_scans: savedScans,
    },
    progress: buildForwardProgress({
      loggedCalls,
      resolvedCalls,
      savedScans,
      minLoggedCalls: measurement.min_logged_calls,
      minResolvedCalls: measurement.min_resolved_calls,
      measurementRunning: measurement.status === "Running locally",
    }),
  };
}

function filterEntriesForMeasurementWindow<T extends { logged_at: string }>(
  entries: T[],
  measurementStart: string | null,
): T[] {
  if (!measurementStart) return entries;
  const startedAt = Date.parse(measurementStart);
  if (Number.isNaN(startedAt)) return [];

  return entries.filter((entry) => {
    const loggedAt = Date.parse(entry.logged_at);
    return !Number.isNaN(loggedAt) && loggedAt >= startedAt;
  });
}

export function startForwardMeasurement(input: {
  min_logged_calls?: unknown;
  min_resolved_calls?: unknown;
  trigger?: unknown;
} = {}): ForwardProofStatus {
  const minLoggedCalls = cleanCount(input.min_logged_calls, defaultMeasurementContract.min_logged_calls);
  const minResolvedCalls = cleanCount(input.min_resolved_calls, defaultMeasurementContract.min_resolved_calls);
  recordProductMetric({
    event: "forward_measurement_started",
    surface: "review",
    entity_id: "forward-measurement",
    metadata: {
      status: "Running locally",
      min_logged_calls: minLoggedCalls,
      min_resolved_calls: minResolvedCalls,
      baseline: defaultMeasurementContract.baseline,
      cost_policy: defaultMeasurementContract.cost_policy,
      pass_fail_gate: defaultMeasurementContract.pass_fail_gate,
      trigger: typeof input.trigger === "string" ? input.trigger : "manual",
    },
  });
  return getForwardProofStatus();
}

function getForwardMeasurementContract(): ForwardMeasurementContract {
  const event = store()
    .productEvents(250)
    .find((row) => row.event === "forward_measurement_started" || row.event === "forward_trial_started");
  if (!event) {
    return {
      status: "Not started",
      started_at: null,
      ...defaultMeasurementContract,
      note: "No dated measurement window is running. Start measuring first, then let calls resolve before trusting the result.",
    };
  }

  const metadata = readTrialMetadata(event);
  return {
    status: "Running locally",
    started_at: event.created_at,
    min_logged_calls: cleanCount(metadata.min_logged_calls, defaultMeasurementContract.min_logged_calls),
    min_resolved_calls: cleanCount(metadata.min_resolved_calls, defaultMeasurementContract.min_resolved_calls),
    baseline: cleanBaseline(metadata.baseline),
    cost_policy: cleanText(metadata.cost_policy, defaultMeasurementContract.cost_policy),
    pass_fail_gate: cleanPassFailGate(metadata.pass_fail_gate),
    note: "This starts the measurement window. It still needs enough later results before the baseline comparison means anything. Calls are measured from this saved point forward.",
  };
}

function readTrialMetadata(event: ProductMetricEventRow) {
  return event.metadata && typeof event.metadata === "object"
    ? (event.metadata as Record<string, unknown>)
    : {};
}

function cleanCount(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(500, Math.round(value)))
    : fallback;
}

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 220) : fallback;
}

function cleanBaseline(value: unknown) {
  const text = cleanText(value, defaultMeasurementContract.baseline);
  if (/equal[- ]weight visible portfolio hold/i.test(text)) {
    return defaultMeasurementContract.baseline;
  }
  return text;
}

function cleanPassFailGate(value: unknown) {
  const text = cleanText(value, defaultMeasurementContract.pass_fail_gate);
  if (/edge claim|proof of edge|decision edge|claim it is outperforming|is outperforming/i.test(text)) {
    return defaultMeasurementContract.pass_fail_gate;
  }
  return text;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "the saved start date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function buildForwardProgress({
  loggedCalls,
  resolvedCalls,
  savedScans,
  minLoggedCalls,
  minResolvedCalls,
  measurementRunning,
}: {
  loggedCalls: number;
  resolvedCalls: number;
  savedScans: number;
  minLoggedCalls: number;
  minResolvedCalls: number;
  measurementRunning: boolean;
}): ForwardProofStatus["progress"] {
  const remainingLogged = Math.max(minLoggedCalls - loggedCalls, 0);
  const remainingResolved = Math.max(minResolvedCalls - resolvedCalls, 0);
  const nextStep = !measurementRunning
    ? "Start measuring before treating later calls as forward evidence."
    : remainingLogged > 0
      ? `Save ${remainingLogged} more ${remainingLogged === 1 ? "call" : "calls"} after the start point.`
      : remainingResolved > 0
        ? `Resolve ${remainingResolved} more later ${remainingResolved === 1 ? "result" : "results"} before comparing with the baseline.`
        : "Enough local calls and later results exist to compare with the saved baseline.";

  return {
    saved_calls: `${loggedCalls}/${minLoggedCalls} saved after the start point`,
    later_results: `${resolvedCalls}/${minResolvedCalls} later results`,
    saved_scans: `${savedScans} saved ${savedScans === 1 ? "market read" : "market reads"}`,
    next_step: nextStep,
  };
}
