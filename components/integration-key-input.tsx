"use client";

import { useEffect, useId, useState } from "react";
import { CheckCircle2, KeyRound, Save, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type IntegrationKeyInputProps = {
  service: string;
  label: string;
};

export function IntegrationKeyInput({ service, label }: IntegrationKeyInputProps) {
  const inputId = useId();
  const storageKey = `financial-copilot.integration-key.${service}`;
  const connectionKey = `financial-copilot.integration-connected.${service}`;
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("Optional key stays in localStorage only.");

  useEffect(() => {
    setValue(window.localStorage.getItem(storageKey) ?? "");
    setConnected(window.localStorage.getItem(connectionKey) === "true");
    setLoaded(true);
  }, [connectionKey, storageKey]);

  function updateValue(nextValue: string) {
    setValue(nextValue);
    setSaved(false);
    window.localStorage.setItem(storageKey, nextValue);
    setMessage("Unsaved edit staged in this browser.");
  }

  function saveKey() {
    markBrowserAction(`save-${service}`);
    window.localStorage.setItem(storageKey, value);
    setSaved(true);
    setMessage(value ? "Saved in this browser only." : "Saved empty local key state.");
  }

  function connectDemo() {
    markBrowserAction(`connect-${service}`);
    const nextConnected = !connected;
    setConnected(nextConnected);
    window.localStorage.setItem(connectionKey, String(nextConnected));
    setMessage(
      nextConnected
        ? "Connected locally for review mode; no external service was contacted."
        : "Disconnected local review state.",
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={inputId} className="text-slate-100">
          {label}
        </Label>
        {connected ? (
          <Badge variant="outline" className="border-emerald-300/40 text-emerald-100">
            <CheckCircle2 aria-hidden="true" className="mr-1 size-3" />
            Connected locally
          </Badge>
        ) : null}
      </div>
      <div className="relative">
        <KeyRound
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
        />
        <Input
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => updateValue(event.target.value)}
          placeholder="Enter optional API key"
          className="border-white/15 bg-slate-950/70 pl-9 text-slate-100 placeholder:text-slate-500"
          aria-describedby={`${inputId}-hint`}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          onClick={saveKey}
          data-rds-action="save"
          data-action-state={saved ? "changed" : "idle"}
          data-persona="operator reviewer user"
          className="border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
        >
          <Save aria-hidden="true" />
          {saved ? "Saved key" : "Save key"}
        </Button>
        <Button
          type="button"
          onClick={connectDemo}
          data-rds-action="connect"
          data-action-state={connected ? "changed" : "idle"}
          data-persona="operator reviewer user"
          className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"
        >
          <Wifi aria-hidden="true" />
          {connected ? "Disconnect" : "Connect"}
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {message}
      </p>
      <p id={`${inputId}-hint`} className="text-xs leading-5 text-slate-500" data-action-evidence={message}>
        {loaded && (value || saved || connected) ? message : "Optional key stays in localStorage only."}
      </p>
    </div>
  );
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
