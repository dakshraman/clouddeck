import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";

export type StatTone = "indigo" | "green" | "amber" | "red";

const toneClass: Record<StatTone, string> = {
  indigo: "bg-indigo-500",
  green: "bg-green-500",
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
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {Icon ? <Icon size={16} className="shrink-0 text-slate-500" aria-hidden="true" /> : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-100">{value}</p>
      {sub ? <p className="mt-1 truncate text-xs text-slate-500">{sub}</p> : null}
      {typeof progress === "number" ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={cn("h-full rounded-full transition-all", toneClass[tone])}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}
    </Card>
  );
}
