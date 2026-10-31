import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/components/ui/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
  {
    variants: {
      variant: {
        neutral: "border-border bg-muted/60 text-muted-foreground",
        green: "border-success/30 bg-success/10 text-emerald-800 dark:text-emerald-400 font-semibold",
        red: "border-destructive/40 bg-destructive/10 text-red-800 dark:text-red-400 font-semibold",
        amber: "border-warning/40 bg-warning/10 text-amber-900 dark:text-amber-400 font-semibold",
        indigo: "border-brand/40 bg-brand/10 text-brand font-semibold",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export type BadgeVariant = "neutral" | "green" | "red" | "amber" | "indigo";

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
  VariantProps<typeof badgeVariants> { }

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
