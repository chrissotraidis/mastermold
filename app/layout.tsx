// Root layout — Master Mold "Sentinel" theme.
// Keep `import "./globals.css"` and the design-token classes on body.
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ProfileProvider } from "@/components/profile-provider";
import { FaceActivityProvider } from "@/components/face-activity";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Master Mold",
  description: "A personal financial copilot for daily portfolio review. Advisory only in this build.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn("dark", spaceGrotesk.variable, inter.variable, jetbrainsMono.variable)}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen bg-background font-body text-foreground antialiased"
        suppressHydrationWarning
      >
        <ProfileProvider>
          <FaceActivityProvider>{children}</FaceActivityProvider>
        </ProfileProvider>
      </body>
    </html>
  );
}
