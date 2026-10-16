import type { HTMLAttributes } from "react";
import { cn } from "@/components/ui/cn";

export type BadgeVariant = "neutral" | "green" | "red" | "amber" | "indigo";

const variantClass: Record<BadgeVariant, string> = {
  neutral: "border-slate-700 bg-slate-800/70 text-slate-400",
  green: "border-green-500/30 bg-green-500/10 text-green-400",
  red: "border-red-500/30 bg-red-500/10 text-red-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-4",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  );
}
