import type { HTMLAttributes } from "react";
import { cn } from "@/components/ui/cn";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} {...props} />;
}
