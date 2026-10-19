import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";

export type AlertVariant = "error" | "success" | "warning" | "info";

const variantClass: Record<AlertVariant, string> = {
  error: "border-destructive/40 bg-destructive/10 text-red-300 [--alert-accent:theme(colors.red.500)]",
  success: "border-success/30 bg-success/10 text-emerald-300 [--alert-accent:theme(colors.emerald.500)]",
  warning: "border-warning/40 bg-warning/10 text-amber-200 [--alert-accent:theme(colors.amber.500)]",
  info: "border-primary/30 bg-primary/10 text-indigo-200 [--alert-accent:theme(colors.indigo.500)]",
};

const variantIcon: Record<AlertVariant, LucideIcon> = {
  error: CircleAlert,
  success: CircleCheck,
  warning: TriangleAlert,
  info: Info,
};

interface AlertProps {
  variant?: AlertVariant;
  className?: string;
  children: ReactNode;
}

export function Alert({ variant = "error", className, children }: AlertProps) {
  const Icon = variantIcon[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-l-2 border-l-[var(--alert-accent)] px-4 py-3 text-sm",
        variantClass[variant],
        className,
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
