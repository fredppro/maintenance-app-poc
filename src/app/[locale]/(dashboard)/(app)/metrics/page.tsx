import { MetricsPageClient } from "./metrics-page-client";
import { PageViewTransition } from "@/components/app-shell/page-view-transition";

export default function MetricsPage() {
  return (
    <PageViewTransition>
      <MetricsPageClient />
    </PageViewTransition>
  );
}
