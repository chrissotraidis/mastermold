export type AccessRole = "operator" | "viewer" | "denied";

export type AccessDecision = {
  role: AccessRole;
  local: boolean;
  reason: string;
};

type AccessInput = {
  method: string;
  host: string | null;
  authorization: string | null;
};

type OriginInput = {
  method: string;
  host: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
  origin: string | null;
};
type AccessEnv = {
  MASTERMOLD_BIND?: string;
  MASTERMOLD_OPERATOR_PASSWORD?: string;
  MASTERMOLD_VIEWER_PASSWORD?: string;
};


const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

export function isLoopbackHost(host: string | null): boolean {
  const normalized = hostnameOnly(host);
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function accessForRequest(
  input: AccessInput,
  env: AccessEnv = process.env as AccessEnv,
): AccessDecision {
  const local = isLoopbackHost(input.host) && !isRemoteBind(env.MASTERMOLD_BIND);
  if (local) return { role: "operator", local: true, reason: "loopback" };

  const basic = parseBasicAuthorization(input.authorization);
  if (!basic) return { role: "denied", local: false, reason: "credentials required" };

  const operatorPassword = configuredSecret(env.MASTERMOLD_OPERATOR_PASSWORD);
  if (
    basic.username === "operator" &&
    operatorPassword &&
    constantTimeEqual(basic.password, operatorPassword)
  ) {
    return { role: "operator", local: false, reason: "operator credentials" };
  }

  const viewerPassword = configuredSecret(env.MASTERMOLD_VIEWER_PASSWORD);
  if (
    basic.username === "viewer" &&
    viewerPassword &&
    constantTimeEqual(basic.password, viewerPassword)
  ) {
    return { role: "viewer", local: false, reason: "viewer credentials" };
  }

  return { role: "denied", local: false, reason: "invalid credentials" };
}

export function mutationHasSameOrigin(input: OriginInput): boolean {
  if (isSafeMethod(input.method)) return true;
  if (!input.origin) return false;

  const expectedHost = (input.forwardedHost || input.host || "").trim().toLowerCase();
  if (!expectedHost) return false;
  const expectedProto = (input.forwardedProto || "http").split(",")[0].trim().toLowerCase();

  try {
    const origin = new URL(input.origin);
    return origin.protocol === expectedProto + ":" && origin.host.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

function configuredSecret(value: string | undefined): string | null {
  const secret = value?.trim() ?? "";
  return secret.length >= 16 ? secret : null;
}

function isRemoteBind(value: string | undefined): boolean {
  const bind = value?.trim().toLowerCase();
  if (!bind) return false;
  return bind !== "localhost" && bind !== "127.0.0.1" && bind !== "::1";
}

function hostnameOnly(host: string | null): string {
  if (!host) return "";
  const normalized = host.trim().toLowerCase();
  if (normalized.startsWith("[")) {
    const end = normalized.indexOf("]");
    return end >= 0 ? normalized.slice(1, end) : normalized;
  }
  return normalized.split(":")[0];
}

function parseBasicAuthorization(
  authorization: string | null,
): { username: string; password: string } | null {
  if (!authorization?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 1) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}
