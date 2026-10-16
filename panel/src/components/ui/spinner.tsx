import { LoaderCircle } from "lucide-react";
import { cn } from "@/components/ui/cn";

interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 16, className }: SpinnerProps) {
  return <LoaderCircle size={size} className={cn("animate-spin", className)} aria-hidden="true" />;
}
