import { InventoryPageClient } from "./inventory-page-client";
import { PageViewTransition } from "@/components/app-shell/page-view-transition";

export default function InventoryPage() {
  return (
    <PageViewTransition>
      <InventoryPageClient />
    </PageViewTransition>
  );
}
