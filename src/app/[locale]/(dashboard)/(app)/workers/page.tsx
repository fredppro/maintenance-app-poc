import { WorkersPageClient } from "./workers-page-client";
import { PageViewTransition } from "@/components/app-shell/page-view-transition";

export default function WorkersPage() {
  return (
    <PageViewTransition>
      <WorkersPageClient />
    </PageViewTransition>
  );
}
