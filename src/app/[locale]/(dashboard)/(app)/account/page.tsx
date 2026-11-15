import { SessionManagement } from "@/features/auth/ui/session-management";
import { PageViewTransition } from "@/components/app-shell/page-view-transition";

export default function AccountPage() {
  return (
    <PageViewTransition>
      <SessionManagement />
    </PageViewTransition>
  );
}
