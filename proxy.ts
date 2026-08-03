import { NextRequest, NextResponse } from "next/server";
import {
  accessForRequest,
  isSafeMethod,
  mutationHasSameOrigin,
} from "@/src/security/request-access";
import { rateLimitMutation } from "@/src/security/request-rate-limit";

const PUBLIC_ASSET = /^\/(?:_next\/static|_next\/image|favicon\.ico|robots\.txt|.*\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?))$/i;

export function proxy(request: NextRequest) {
  if (PUBLIC_ASSET.test(request.nextUrl.pathname)) return NextResponse.next();

  const decision = accessForRequest({
    method: request.method,
    host: request.headers.get("host"),
    authorization: request.headers.get("authorization"),
  });

  if (decision.role === "denied") {
    return accessError(request, 401, "Authentication required.");
  }

  if (!isSafeMethod(request.method)) {
    if (decision.role !== "operator") {
      return accessError(request, 403, "Read-only access cannot change Master Mold state.");
    }

    if (
      (request.headers.has("origin") || !decision.local) &&
      !mutationHasSameOrigin({
        method: request.method,
        host: request.headers.get("host"),
        forwardedHost: request.headers.get("x-forwarded-host"),
        forwardedProto: request.headers.get("x-forwarded-proto"),
        origin: request.headers.get("origin"),
      })
    ) {
      return accessError(request, 403, "State changes require a matching same-origin request.");
    }

    const rateLimit = rateLimitMutation({
      method: request.method,
      pathname: request.nextUrl.pathname,
      identity: decision.local ? "loopback-operator" : "remote-operator",
    });
    if (!rateLimit.allowed) {
      return rateLimitError(request, rateLimit.retryAfterSeconds, rateLimit.limit);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-mastermold-role", decision.role);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

function accessError(request: NextRequest, status: 401 | 403, message: string) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  if (status === 401) headers.set("WWW-Authenticate", 'Basic realm="Master Mold", charset="UTF-8"');

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status, headers });
  }

  return new NextResponse(message, { status, headers });
}

function rateLimitError(request: NextRequest, retryAfterSeconds: number, limit: number) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Retry-After": String(retryAfterSeconds),
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": "0",
  });
  const message = "Too many state-changing requests. Try again shortly.";
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status: 429, headers });
  }
  return new NextResponse(message, { status: 429, headers });
}

export const config = {
  matcher: ["/:path*"],
};
