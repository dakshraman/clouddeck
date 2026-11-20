import { FleetManager } from "@/components/fleet/fleet-manager";
import { PageHeader } from "@/components/page-header";

export default function ServersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Fleet Clusters"
        description="Unified multi-server management, health monitoring, and node orchestration."
      />
      <FleetManager />
    </div>
  );
}
