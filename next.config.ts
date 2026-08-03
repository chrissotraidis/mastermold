import type { NextConfig } from "next";
const scriptSource = process.env.NODE_ENV === "development"
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src " + scriptSource + "; connect-src 'self' https: wss:; worker-src 'self' blob:",
          },
        ],
      },
    ];
  },
  // Local reference projects can contain private runtime state and must never
  // enter the public standalone artifact, even if a broad file trace occurs.
  outputFileTracingExcludes: {
    "/*": ["./ref/**/*", "./next.config.ts"],
  },
  turbopack: {
    root: process.cwd(),
  },
  // Allow local dev access from 127.0.0.1 / localhost without the cross-origin
  // dev-fallback that otherwise causes a hydration mismatch on first load.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
