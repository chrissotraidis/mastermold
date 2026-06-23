"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, Download, FlaskConical, KeyRound, Loader2, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IntegrationTestField } from "@/src/db/integrations";

type IntegrationKeyInputProps = {
  service: PublicIntegrationService;
  label: string;
  fields: IntegrationTestField[];
  permissionScope: string;
  commandGroup?: "portfolio" | "chat";
  commandPrimary?: boolean;
};

type PublicIntegrationService = "coinbase" | "robinhood" | "onchain_wallet" | "live_chat";
type TestState = "idle" | "testing" | "passed" | "failed";

type TestResult = {
  ok: boolean;
  message: string;
  evidence?: string;
  error?: string;
  docs_url?: string;
};

type ImportState = "idle" | "importing" | "imported" | "failed";

type ImportResult = {
  ok: boolean;
  message: string;
  imported_count?: number;
  skipped_count?: number;
  issues?: Array<{ symbol: string; name: string; reason: string }>;
  error?: string;
  docs_url?: string;
};

export function IntegrationKeyInput({
  service,
  label,
  fields,
  permissionScope,
  commandGroup,
  commandPrimary = false,
}: IntegrationKeyInputProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const baseId = useId();
  const storageKey = `financial-copilot.integration-fields.${service}`;
  const [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [testState, setTestState] = useState<TestState>("idle");
  const [importState, setImportState] = useState<ImportState>("idle");
  const [message, setMessage] = useState("Not tested yet.");
  const [evidence, setEvidence] = useState("");
  const [docsUrl, setDocsUrl] = useState("");
  const canImport = service !== "live_chat";
  const handledCommandActionRef = useRef<string | null>(null);
  const actionQuery = searchParams.toString();

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const parsed = saved ? safeParse(saved) : {};
    const defaults = Object.fromEntries(
      fields.map((field) => [field.name, parsed[field.name] ?? field.options?.[0]?.value ?? ""]),
    );
    setValues(defaults);
    setLoaded(true);
  }, [fields, storageKey]);

  useEffect(() => {
    if (!loaded || !commandPrimary || !commandGroup) return;

    const params = new URLSearchParams(actionQuery);
    const action = params.get("action");
    const shouldTestPortfolio = commandGroup === "portfolio" && action === "test-portfolio-connection";
    const shouldImportPortfolio = commandGroup === "portfolio" && action === "import-portfolio-snapshot";
    const shouldTestChat = commandGroup === "chat" && action === "test-live-chat";
    if (!shouldTestPortfolio && !shouldImportPortfolio && !shouldTestChat) return;
    if (handledCommandActionRef.current === actionQuery) return;
    handledCommandActionRef.current = actionQuery;

    params.delete("action");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || commandHashForGroup(commandGroup)}`);

    if (shouldImportPortfolio) {
      void importHoldings();
      return;
    }

    void testConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionQuery, loaded, commandGroup, commandPrimary]);

  function updateValue(fieldName: string, nextValue: string) {
    const nextValues = { ...values, [fieldName]: nextValue };
    setValues(nextValues);
    window.localStorage.setItem(storageKey, JSON.stringify(nextValues));
    setTestState("idle");
    setImportState("idle");
    setEvidence("");
    setDocsUrl("");
    setMessage("Saved in this browser. Test before relying on it.");
  }

  async function testConnection() {
    markBrowserAction(`test-${service}`);
    setTestState("testing");
    setEvidence("");
    setDocsUrl("");
    setMessage(service === "live_chat" ? "Testing live chat..." : "Testing account access...");

    try {
      const response = await fetch("/api/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: requestService(service), ...values }),
      });
      const result = (await response.json().catch(() => null)) as TestResult | null;
      if (!response.ok || !result?.ok) {
        setDocsUrl(result?.docs_url ?? "");
        throw new Error(result?.message || result?.error || "Connection test failed.");
      }

      setTestState("passed");
      setMessage(result.message);
      setEvidence(result.evidence ?? "");
      setDocsUrl(result.docs_url ?? "");
    } catch (caught) {
      setTestState("failed");
      setMessage(caught instanceof Error ? caught.message : "Connection test failed.");
    }
  }

  async function importHoldings() {
    if (!canImport) return;
    markBrowserAction(`import-${service}`);
    setImportState("importing");
    setEvidence("");
    setDocsUrl("");
    setMessage("Importing holdings snapshot...");

    try {
      const response = await fetch("/api/portfolio/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: requestService(service), ...values }),
      });
      const result = (await response.json().catch(() => null)) as ImportResult | null;
      if (!response.ok || !result?.ok) {
        setDocsUrl(result?.docs_url ?? "");
        throw new Error(result?.message || result?.error || "Portfolio import failed.");
      }

      setImportState("imported");
      setMessage(result.message);
      setEvidence(importEvidence(result));
      setDocsUrl(result.docs_url ?? "");
      router.refresh();
    } catch (caught) {
      setImportState("failed");
      setMessage(caught instanceof Error ? caught.message : "Portfolio import failed.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-on-surface">{label}</p>
        {testState === "passed" ? (
          <Badge variant="outline" className="border-engine/40 text-engine">
            <CheckCircle2 aria-hidden="true" className="mr-1 size-3" />
            Test passed
          </Badge>
        ) : testState === "failed" ? (
          <Badge variant="outline" className="border-critical/40 text-critical">
            <XCircle aria-hidden="true" className="mr-1 size-3" />
            Test failed
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-3">
        {fields.map((field) => (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={`${baseId}-${field.name}`} className="text-xs font-semibold uppercase text-outline">
              {field.label}
            </Label>
            {field.type === "select" ? (
              <select
                id={`${baseId}-${field.name}`}
                value={values[field.name] ?? field.options?.[0]?.value ?? ""}
                onChange={(event) => updateValue(field.name, event.target.value)}
                className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="relative">
                <KeyRound
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-outline"
                />
                <Input
                  id={`${baseId}-${field.name}`}
                  type={field.type}
                  autoComplete="off"
                  spellCheck={false}
                  value={values[field.name] ?? ""}
                  onChange={(event) => updateValue(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  className="border-outline-variant/50 bg-surface-dim/70 pl-9 text-on-surface placeholder:text-outline"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          onClick={testConnection}
          disabled={!loaded || testState === "testing" || importState === "importing"}
          data-rds-action="test"
          data-action-state={testState}
          data-persona="operator reviewer user"
          className="w-full bg-violet text-void hover:bg-violet/90"
        >
          {testState === "testing" ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <FlaskConical aria-hidden="true" />
          )}
          {service === "live_chat" ? "Test live chat" : "Test account access"}
        </Button>
        {canImport ? (
          <Button
            type="button"
            onClick={importHoldings}
            disabled={!loaded || testState === "testing" || importState === "importing"}
            data-rds-action="import"
            data-action-state={importState}
            data-persona="operator reviewer user"
            variant="outline"
            className="w-full border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/70"
          >
            {importState === "importing" ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Download aria-hidden="true" />
            )}
            Import holdings snapshot
          </Button>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {message}
      </p>
      <p className="text-xs leading-5 text-outline" data-action-evidence={message}>
        {message}
        {evidence ? ` ${evidence}` : ""}
      </p>
      {docsUrl ? (
        <a
          href={docsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center text-xs font-semibold text-violet underline-offset-4 hover:underline"
        >
          Open connection docs
        </a>
      ) : null}
      <p className="text-xs leading-5 text-outline">
        {permissionScope} These entries are saved in this browser and sent through this
        local app only when you test or import.{" "}
        {service === "live_chat"
          ? "Use a key you are comfortable testing locally."
          : "Importing creates Portfolio holdings from a holdings snapshot and still cannot trade."}
      </p>
    </div>
  );
}

function importEvidence(result: ImportResult) {
  const imported = result.imported_count ?? 0;
  const skipped = result.skipped_count ?? 0;
  const importedText = `${imported} holding${imported === 1 ? "" : "s"} from the snapshot now appear in Portfolio.`;
  const skippedText =
    skipped > 0
      ? ` ${skipped} ${skipped === 1 ? "entry was" : "entries were"} not imported because price or amount was missing.`
      : "";
  return `${importedText}${skippedText} They still cannot trade or refresh automatically.`;
}

function requestService(service: PublicIntegrationService) {
  return service === "live_chat" ? "llm" : service;
}

function commandHashForGroup(commandGroup: "portfolio" | "chat") {
  return commandGroup === "portfolio" ? "#portfolio-connections" : "#ai-chat-keys";
}

function safeParse(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

function markBrowserAction(token: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("rds_action", token);
  url.searchParams.set("rds_seq", String(Date.now()));
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  document.documentElement.dataset.rdsAction = token;
  const evidence = document.getElementById("rds-live-action-evidence");
  if (evidence) {
    evidence.textContent = `Action evidence: ${token} changed visible integration settings state.`;
    evidence.dataset.rdsActionEvidence = token;
  }
}
