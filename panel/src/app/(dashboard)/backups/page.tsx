import { BackupsView } from "@/components/backups/backups-view";
import { BackupScheduleCard } from "@/components/backup-schedule";
import { CloudDestinationsCard } from "@/components/backups/cloud-destinations-card";

export default function BackupsPage() {
  return (
    <>
      <BackupsView />
      <div className="mt-6">
        <CloudDestinationsCard />
      </div>
      <div className="mt-6">
        <BackupScheduleCard />
      </div>
    </>
  );
}
