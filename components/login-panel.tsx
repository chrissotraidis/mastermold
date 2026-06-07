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
    <main className="min-h-screen bg-surface-dim px-4 py-8 text-on-surface">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <Card className="w-full border-outline-variant/40 bg-surface-high/40">
          <CardHeader className="space-y-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <Badge className="bg-violet text-void hover:bg-violet">
                Review mode
              </Badge>
              <Badge variant="outline" className="border-engine/40 text-engine">
                Seeded persona
              </Badge>
            </div>
            <div>
              <CardTitle className="text-2xl text-on-surface">Sign in as reviewer</CardTitle>
              <p className="mt-2 text-sm leading-6 text-outline">
                Use reviewer@demo.local or chris@demo.local with password review-demo.
                This local session only unlocks the demo operator path; integrations remain inert.
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <form className="space-y-4" onSubmit={submitLogin}>
              <div className="space-y-2">
                <Label htmlFor="review-email" className="text-on-surface">
                  Email
                </Label>
                <Input
                  id="review-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="border-outline-variant/50 bg-surface-dim/70 text-on-surface"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="review-password" className="text-on-surface">
                  Password
                </Label>
                <div className="relative">
                  <KeyRound
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-outline"
                  />
                  <Input
                    id="review-password"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="border-outline-variant/50 bg-surface-dim/70 pl-9 text-on-surface"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>
              <p className="sr-only" aria-live="polite">
                {message}
              </p>
              <div
                className="rounded-md border border-violet/30 bg-violet/10 p-3 text-sm leading-6 text-on-surface-variant"
                data-login-status={loginComplete ? "complete" : "ready"}
                data-route-family="/dashboard"
                data-persona="operator reviewer"
              >
                <div className="flex items-start gap-2">
                  {loginComplete ? (
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-engine" />
                  ) : (
                    <LogIn aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-violet" />
                  )}
                  <p>{message}</p>
                </div>
                <p className="mt-1 text-xs text-outline">
                  Success opens /dashboard for the authenticated operator and reviewer persona.
                </p>
              </div>
              <Button type="submit" className="w-full bg-violet text-void hover:bg-violet">
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
                className="w-full border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60"
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
