import Link from "next/link";
import { Bot, Radar } from "lucide-react";
import { cn } from "@/lib/utils";

/** Switch between the two research labs from either one. */
export function LabSwitch({ current }: { current: "web3" | "polymarket" }) {
  const items = [
    { id: "web3", href: "/trading", label: "Web3", icon: Bot },
    { id: "polymarket", href: "/polymarket", label: "Polymarket", icon: Radar },
  ] as const;
  return (
    <nav aria-label="Research labs" className="inline-flex rounded-full border border-outline-variant/60 bg-surface-low/60 p-1">
      {items.map((item) => {
        const active = item.id === current;
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition",
              active ? "bg-violet text-void" : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" /> {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
