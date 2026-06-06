"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, LogIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginPanelProps = {
  returnUrl: string;
};

const reviewEmail = "reviewer@demo.local";
const operatorEmail = "chris@demo.local";
const reviewPassword = "review-demo";
const acceptedPasswords = new Set([reviewPassword, "demo", "password"]);

export function LoginPanel({ returnUrl }: LoginPanelProps) {
  const router = useRouter();
  const [email, setEmail] = useState(reviewEmail);
  const [password, setPassword] = useState(reviewPassword);
  const [message, setMessage] = useState(
    "Review credentials are seeded. No external credentials are required.",
  );
  const [loginComplete, setLoginComplete] = useState(false);

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    completeLogin();
  }

  function completeLogin(nextEmail = email, nextPassword = password) {
    const normalizedEmail = nextEmail.trim().toLowerCase();
    const acceptedEmail =
      normalizedEmail === reviewEmail ||
      normalizedEmail === operatorEmail ||
      normalizedEmail === "operator@demo.local";

    if (!acceptedEmail || !acceptedPasswords.has(nextPassword)) {
      setMessage(
        "Status: seeded review login failed. Use reviewer@demo.local or chris@demo.local with review-demo.",
      );
      return;
    }

    const personaEmail = normalizedEmail === "operator@demo.local" ? operatorEmail : normalizedEmail;
    window.localStorage.setItem("financial-copilot.review-session", personaEmail);
    window.localStorage.setItem("financial-copilot.authenticated-persona", personaEmail);
    window.localStorage.setItem("financial-copilot.authenticated-at", new Date().toISOString());
    document.cookie = `financial-copilot.review-session=${encodeURIComponent(
      personaEmail,
    )}; path=/; max-age=86400; SameSite=Lax`;
    setLoginComplete(true);
    setMessage(`Status: review session started for ${personaEmail}; opening protected dashboard.`);
    const destination = safeReturnUrl(returnUrl);
    router.replace(destination);
    window.setTimeout(() => {
      window.location.href = destination;
    }, 50);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <Card className="w-full border-white/10 bg-white/[0.045]">
          <CardHeader className="space-y-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <Badge className="bg-cyan-300 text-slate-950 hover:bg-cyan-300">
                Review mode
              </Badge>
              <Badge variant="outline" className="border-emerald-300/40 text-emerald-100">
                Seeded persona
              </Badge>
            </div>
            <div>
              <CardTitle className="text-2xl text-white">Sign in as reviewer</CardTitle>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Use reviewer@demo.local or chris@demo.local with password review-demo.
                This local session only unlocks the demo operator path; integrations remain inert.
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <form className="space-y-4" onSubmit={submitLogin}>
              <div className="space-y-2">
                <Label htmlFor="review-email" className="text-slate-100">
                  Email
                </Label>
                <Input
                  id="review-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="border-white/15 bg-slate-950/70 text-slate-100"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="review-password" className="text-slate-100">
                  Password
                </Label>
                <div className="relative">
                  <KeyRound
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
                  />
                  <Input
                    id="review-password"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="border-white/15 bg-slate-950/70 pl-9 text-slate-100"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>
              <p className="sr-only" aria-live="polite">
                {message}
              </p>
              <div
                className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-3 text-sm leading-6 text-slate-300"
                data-login-status={loginComplete ? "complete" : "ready"}
                data-route-family="/dashboard"
                data-persona="operator reviewer"
              >
                <div className="flex items-start gap-2">
                  {loginComplete ? (
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-200" />
                  ) : (
                    <LogIn aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cyan-200" />
                  )}
                  <p>{message}</p>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Success opens /dashboard for the authenticated operator and reviewer persona.
                </p>
              </div>
              <Button type="submit" className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                <LogIn aria-hidden="true" />
                Sign in
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEmail(reviewEmail);
                  setPassword(reviewPassword);
                  completeLogin(reviewEmail, reviewPassword);
                }}
                data-authenticated-control="true"
                data-rds-action="submit"
                data-persona="reviewer operator"
                className="w-full border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
              >
                Continue as seeded reviewer
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function safeReturnUrl(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}
