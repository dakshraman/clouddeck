import { AppStoreView } from "@/components/apps/app-store-view";
import { PageHeader } from "@/components/page-header";

export default function AppsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="1-Click App Store"
        description="Deploy curated production stacks (Ghost, Plausible, Umami, n8n, MinIO, Vaultwarden) via Docker Compose."
      />
      <AppStoreView />
    </div>
  );
}
