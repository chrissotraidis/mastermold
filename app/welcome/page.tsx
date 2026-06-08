import type { Metadata } from "next";
import { WelcomeFlow } from "@/components/welcome-flow";

export const metadata: Metadata = {
  title: "Get started — Master Mold",
  description: "Set up your Master Mold profile, or explore the demo first.",
};

export default function WelcomePage() {
  return <WelcomeFlow />;
}
