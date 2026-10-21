import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";

export type StatTone = "indigo" | "green" | "amber" | "red";

const toneClass: Record<StatTone, string> = {
  indigo: "bg-brand",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  progress?: number;
  tone?: StatTone;
}

export function StatCard({ label, value, sub, icon: Icon, progress, tone = "indigo" }: StatCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {Icon ? <Icon size={15} className="shrink-0 text-muted-foreground/80" aria-hidden="true" /> : null}
      </div>
      <p className="tabular mt-2.5 text-2xl font-semibold text-card-foreground">{value}</p>
      {sub ? <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p> : null}
      {typeof progress === "number" ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all duration-500", toneClass[tone])}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}
    </Card>
  );
}
