import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes } from "react";
import { cn } from "@/components/ui/cn";

export const inputClass =
  "h-9 w-full rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputClass, className)} {...props} />;
  },
);

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("text-xs font-medium text-muted-foreground", className)} {...props} />
  );
}
