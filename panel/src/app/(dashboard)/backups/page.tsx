import { BackupsView } from "@/components/backups/backups-view";
import { BackupScheduleCard } from "@/components/backup-schedule";

export default function BackupsPage() {
  return (
    <>
      <BackupsView />
      <div className="mt-6">
        <BackupScheduleCard />
      </div>
    </>
  );
}
