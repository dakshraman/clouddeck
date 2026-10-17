"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "failed";

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API unavailable (e.g. insecure context) - fall back below.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label = "Copy", className }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");

  async function onCopy() {
    const ok = await copyText(value);
    setState(ok ? "copied" : "failed");
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void onCopy()}
        className={className}
        aria-label={label}
        title={label}
      >
        {state === "copied" ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <Copy size={14} aria-hidden="true" />
        )}
        {state === "copied" ? "Copied" : label}
      </Button>
      {state === "failed" ? (
        <span className="text-xs text-red-400">Copy failed - select it manually.</span>
      ) : null}
    </span>
  );
}
