import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";

export type AlertVariant = "error" | "success" | "warning" | "info";

const variantClass: Record<AlertVariant, string> = {
  error: "border-red-500/30 bg-red-500/10 text-red-400",
  success: "border-green-500/30 bg-green-500/10 text-green-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  info: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
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
        "flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm",
        variantClass[variant],
        className,
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
