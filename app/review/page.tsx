import { AppShell, FirstRunBanner } from "@/components/app-shell";
import { ReviewReadiness } from "@/components/review-readiness";

export default function ReviewPage() {
  return (
    <AppShell>
      <FirstRunBanner />
      <div className="mx-auto max-w-6xl px-5 py-8">
        <p className="sr-only">
          PBO MinTRL review readiness details are included in the Not yet live in V0
          disclosure below.
        </p>
        <ReviewReadiness surface="public" />
      </div>
    </AppShell>
  );
}
