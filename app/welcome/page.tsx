import type { Metadata } from "next";
import { WelcomeFlow } from "@/components/welcome-flow";

export const metadata: Metadata = {
  title: "Get started - Master Mold",
  description: "Save local Master Mold preferences, or open the sample dashboard first.",
};

export default function WelcomePage() {
  return <WelcomeFlow />;
}
