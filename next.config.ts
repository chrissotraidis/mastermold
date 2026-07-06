import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  // Allow local dev access from 127.0.0.1 / localhost without the cross-origin
  // dev-fallback that otherwise causes a hydration mismatch on first load.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
