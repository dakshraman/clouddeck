"use client";

import * as DropdownMenu from "@animate-ui/react/primitives/radix-ui/dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { usePreferences } from "@/components/preferences";
import { getTheme, THEMES, type ThemeId } from "@/lib/themes";

function ThemeSwatches({ colors }: { colors: readonly string[] }) {
  return (
    <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
      {colors.map((color) => (
        <span
          key={color}
          className="h-4 w-4 rounded-full border border-black/20 ring-1 ring-white/10"
          style={{ background: color }}
        />
      ))}
    </span>
  );
}

export function ThemePicker() {
  const { theme, setTheme } = usePreferences();
  const current = getTheme(theme);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5 text-left outline-none transition-colors hover:border-border/80 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring sm:w-80"
        >
          <ThemeSwatches colors={current.preview} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {current.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {current.description}
            </span>
          </span>
          <ChevronDown
            size={15}
            className="shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-2xl shadow-black/40 ring-1 ring-border/60 backdrop-blur-xl"
        >
          <DropdownMenu.Label className="px-2.5 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Theme
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={theme}
            onValueChange={(value: string) => setTheme(value as ThemeId)}
            aria-label="Theme"
          >
            {THEMES.map((preset) => (
              <DropdownMenu.RadioItem
                key={preset.id}
                value={preset.id}
                className="relative flex cursor-pointer select-none items-center gap-3 rounded-lg px-2.5 py-2 pr-10 outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
              >
                <ThemeSwatches colors={preset.preview} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{preset.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {preset.description}
                  </span>
                </span>
                <DropdownMenu.ItemIndicator className="absolute right-2.5 flex h-5 w-5 items-center justify-center">
                  <Check size={15} className="text-brand" aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <p className="px-2.5 py-1 text-[11px] text-muted-foreground">
            Saved in this browser.
          </p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
