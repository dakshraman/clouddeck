import {
  Children,
  Fragment,
  isValidElement,
  type ChangeEvent,
  type ReactNode,
} from "react";
import * as SelectPrimitive from "@animate-ui/react/primitives/radix-ui/select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { inputClass } from "@/components/ui/input";

const EMPTY_OPTION = "__clouddeck_empty__";

interface Option {
  value: string;
  label: ReactNode;
  disabled: boolean;
}

function collectOptions(children: ReactNode, options: Option[] = []): Option[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment || child.type === "optgroup") {
      collectOptions((child.props as { children?: ReactNode }).children, options);
      return;
    }
    if (child.type !== "option") return;
    const props = child.props as {
      value?: string | number;
      disabled?: boolean;
      children?: ReactNode;
    };
    options.push({
      value: props.value === undefined ? "" : String(props.value),
      label: props.children,
      disabled: Boolean(props.disabled),
    });
  });
  return options;
}

export interface SelectProps {
  id?: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

export function Select({
  id,
  value,
  onChange,
  disabled,
  required,
  className,
  children,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: SelectProps) {
  const options = collectOptions(children);
  const selectedValue = value === "" ? EMPTY_OPTION : value;
  const selectedOption = options.find((option) => option.value === (value ?? ""));
  const showPlaceholder = !selectedOption || selectedOption.value === "";

  return (
    <SelectPrimitive.Root
      value={selectedValue}
      onValueChange={(next) => {
        onChange?.({
          target: { value: next === EMPTY_OPTION ? "" : next },
        } as ChangeEvent<HTMLSelectElement>);
      }}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-required={required || undefined}
        className={cn(
          inputClass,
          "group flex cursor-pointer items-center justify-between gap-2 text-left",
          "hover:border-brand/40 data-[state=open]:border-brand data-[state=open]:ring-2 data-[state=open]:ring-brand/20",
          className,
        )}
      >
        <SelectPrimitive.Value
          placeholder="Select…"
          className={cn("min-w-0 flex-1 truncate", showPlaceholder && "text-muted-foreground")}
        >
          {selectedOption?.label ?? "Select…"}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon className="flex shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180">
          <ChevronDown size={14} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-2xl shadow-black/60 ring-1 ring-border/60"
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-muted-foreground">
            <ChevronUp size={14} aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-0">
            {options.map((option, index) => (
              <SelectPrimitive.Item
                key={`${option.value}-${index}`}
                value={option.value === "" ? EMPTY_OPTION : option.value}
                disabled={option.disabled}
                className="relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-2.5 pr-8 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
              >
                <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator
                  animation="draw"
                  className="absolute right-2.5 flex h-4 w-4 items-center justify-center text-brand"
                >
                  <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-muted-foreground">
            <ChevronDown size={14} aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
