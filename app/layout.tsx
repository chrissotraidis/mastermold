// Root layout — Master Mold "Sentinel" theme.
// Keep `import "./globals.css"` and the design-token classes on body.
import type { Metadata } from "next";
import "./globals.css";
import { ProfileProvider } from "@/components/profile-provider";
import { FaceActivityProvider } from "@/components/face-activity";

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
      className="dark"
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
