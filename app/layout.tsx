// Root layout — Master Mold "Sentinel" theme.
// Keep `import "./globals.css"` and the design-token classes on body.
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ProfileProvider } from "@/components/profile-provider";
import { FaceActivityProvider } from "@/components/face-activity";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Master Mold",
  description: "A local-first portfolio review and evidence-gated trading research workspace.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/master-mold-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/master-mold-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/master-mold-icon-512.png", sizes: "512x512", type: "image/png" }],
  },
};

/** Dark status/address bar on mobile, matching the Void background. */
export const viewport: Viewport = {
  themeColor: "#0a090b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      style={{ margin: 0, maxWidth: "100vw", overflowX: "hidden", width: "100%" }}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen bg-background font-body text-foreground antialiased"
        style={{ margin: 0, maxWidth: "100vw", overflowX: "hidden", width: "100%" }}
        suppressHydrationWarning
      >
        <ProfileProvider>
          <FaceActivityProvider>{children}</FaceActivityProvider>
        </ProfileProvider>
      </body>
    </html>
  );
}
