#!/usr/bin/env node
// ops/zo-authgate.mjs — authenticating reverse proxy for Zo public hosting.
//
// Master Mold has no login screen, so it must never face the open internet
// bare (see bin/zo-start). Zo private routes are not provisioning on this
// host, so this gate provides the "authenticating reverse proxy" the
// migration doc requires: HTTP Basic Auth in front, streaming passthrough
// to the local app behind.
//
// Env: MASTERMOLD_GATE_PASSWORD (required), PORT (Zo-injected),
//      GATE_UPSTREAM (default http://127.0.0.1:4002).
import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const PASSWORD = process.env.MASTERMOLD_GATE_PASSWORD;
if (!PASSWORD) {
  console.error("authgate: MASTERMOLD_GATE_PASSWORD is not set; refusing to start");
  process.exit(1);
}
const PORT = Number(process.env.PORT || 4010);
const upstream = new URL(process.env.GATE_UPSTREAM || "http://127.0.0.1:4002");

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function authorized(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = Buffer.from(h.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const idx = decoded.indexOf(":");
  const pass = idx === -1 ? decoded : decoded.slice(idx + 1);
  return safeEqual(pass, PASSWORD);
}

const HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
]);

const server = http.createServer((req, res) => {
  if (!authorized(req)) {
    res.writeHead(401, {
      "www-authenticate": 'Basic realm="Master Mold"',
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end("Authentication required.");
    return;
  }

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP.has(k) && k !== "authorization") headers[k] = v;
  }
  headers["x-forwarded-proto"] = "https";

  const proxied = http.request(
    {
      hostname: upstream.hostname,
      port: upstream.port,
      path: req.url,
      method: req.method,
      headers,
    },
    (up) => {
      const out = {};
      for (const [k, v] of Object.entries(up.headers)) {
        if (!HOP.has(k)) out[k] = v;
      }
      res.writeHead(up.statusCode || 502, out);
      up.pipe(res);
    },
  );
  proxied.on("error", (err) => {
    console.error(`authgate: upstream error for ${req.method} ${req.url}: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end("Upstream unavailable.");
  });
  req.pipe(proxied);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`authgate: listening on 0.0.0.0:${PORT} -> ${upstream.origin}`);
});

// --- Notification forwarder -------------------------------------------------
// Master Mold's notifier POSTs {"text": ...} here (NOTIFY_WEBHOOK_URL); we
// relay it to the operator's Telegram through the Zo host API. Localhost-only,
// rate-limited so a wedged loop can never burn API credits.
const NOTIFY_PORT = Number(process.env.NOTIFY_FORWARD_PORT || 4011);
const ZO_TOKEN = process.env.ZO_CLIENT_IDENTITY_TOKEN || "";
const ZO_MODEL = "byok:b0e75c82-464a-42db-a370-57f93f4acf45";
const RATE_LIMIT = 10;
const sentTimestamps = [];

function rateOk() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  while (sentTimestamps.length && sentTimestamps[0] < cutoff) sentTimestamps.shift();
  if (sentTimestamps.length >= RATE_LIMIT) return false;
  sentTimestamps.push(Date.now());
  return true;
}

async function relayToTelegram(text) {
  const input =
    "Use your send_telegram_message tool RIGHT NOW to send Chris this Master Mold alert verbatim, " +
    "then respond with only the word 'sent'. Do not rephrase it, do not add commentary, do not take any other action.\n\n" +
    text;
  const res = await fetch("https://api.zo.computer/zo/ask", {
    method: "POST",
    headers: { authorization: ZO_TOKEN, "content-type": "application/json" },
    body: JSON.stringify({ input, model_name: ZO_MODEL }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`notify-forward: relayed (${res.status}) -> ${String(data.output || "").slice(0, 60)}`);
}

const notifyServer = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/notify") {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  req.on("data", (c) => {
    body += c;
    if (body.length > 4096) req.destroy();
  });
  req.on("end", () => {
    let text = "";
    try {
      text = String(JSON.parse(body).text || "").slice(0, 1000);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (!text || !ZO_TOKEN) {
      res.writeHead(204).end();
      return;
    }
    if (!rateOk()) {
      console.log("notify-forward: rate limit hit, dropping");
      res.writeHead(429).end();
      return;
    }
    res.writeHead(202).end();
    relayToTelegram(text).catch((err) => console.log(`notify-forward: failed: ${err.message}`));
  });
});

notifyServer.listen(NOTIFY_PORT, "127.0.0.1", () => {
  console.log(`notify-forward: listening on 127.0.0.1:${NOTIFY_PORT}${ZO_TOKEN ? "" : " (no ZO token — relay disabled)"}`);
});
