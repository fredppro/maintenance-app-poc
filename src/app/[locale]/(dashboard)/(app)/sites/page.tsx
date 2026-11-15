import { SitesPageClient } from "./sites-page-client";
import { PageViewTransition } from "@/components/app-shell/page-view-transition";

export default function SitesPage() {
  return (
    <PageViewTransition>
      <SitesPageClient />
    </PageViewTransition>
  );
}
