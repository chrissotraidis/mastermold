"use client";

import { useEffect } from "react";
import { RouteErrorFallback } from "@/components/route-feedback";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <RouteErrorFallback error={error} reset={reset} />;
}
