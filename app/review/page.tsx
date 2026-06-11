import { AppShell } from "@/components/app-shell";
import { ReviewReadiness } from "@/components/review-readiness";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { getDataMode } from "@/src/db/engine-data";

export const dynamic = "force-dynamic";

export default function ReviewPage() {
  const dataMode = getDataMode();
  const publicDataMode = productProvenanceLabel(dataMode.label);

  return (
    <AppShell dataMode={publicDataMode}>
      <div className="mx-auto max-w-6xl px-5 py-8">
        <ReviewReadiness surface="public" />
      </div>
    </AppShell>
  );
}
