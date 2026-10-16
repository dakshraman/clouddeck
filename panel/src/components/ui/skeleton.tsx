import { cn } from "@/components/ui/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-800/60", className)} aria-hidden="true" />;
}
