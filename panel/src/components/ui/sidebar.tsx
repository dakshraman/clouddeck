"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type HTMLAttributes,
  type Ref,
} from "react";
import { Slot } from "@radix-ui/react-slot";
import * as Dialog from "@radix-ui/react-dialog";
import { cva } from "class-variance-authority";
import { PanelLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/components/ui/cn";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarState = "expanded" | "collapsed";

interface SidebarContextValue {
  state: SidebarState;
  open: boolean;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

interface SidebarProviderProps extends HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
}

export function SidebarProvider({
  defaultOpen = true,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(defaultOpen);
  const [openMobile, setOpenMobile] = useState(false);
  const state: SidebarState = open ? "expanded" : "collapsed";

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile((value) => !value);
      return;
    }

    setOpen((value) => {
      const next = !value;
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${next}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
      return next;
    });
  }, [isMobile]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== SIDEBAR_KEYBOARD_SHORTCUT || (!event.metaKey && !event.ctrlKey)) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      event.preventDefault();
      toggleSidebar();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  const contextValue = useMemo(
    () => ({ state, open, openMobile, setOpenMobile, isMobile, toggleSidebar }),
    [state, open, openMobile, isMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        data-state={state}
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as CSSProperties
        }
        className={cn("group/sidebar-wrapper flex min-h-svh w-full bg-sidebar", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

interface SidebarProps extends HTMLAttributes<HTMLDivElement> {
  collapsible?: "icon" | "none";
  variant?: "inset" | "sidebar";
}

export function Sidebar({
  collapsible = "icon",
  variant = "sidebar",
  className,
  children,
  ...props
}: SidebarProps) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (isMobile) {
    return (
      <Dialog.Root open={openMobile} onOpenChange={setOpenMobile}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <Dialog.Content
            id="app-sidebar-mobile"
            className={cn(
              "fixed inset-y-0 left-0 z-50 flex h-full w-[var(--sidebar-width-mobile)] max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground shadow-xl outline-none",
              "data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:duration-200 data-[state=closed]:duration-150",
            )}
            style={{ "--sidebar-width-mobile": SIDEBAR_WIDTH_MOBILE } as CSSProperties}
          >
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Description className="sr-only">CloudDeck panel navigation</Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                aria-label="Close navigation"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
            <div className="flex h-full w-full flex-col">{children}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <aside
      id="app-sidebar"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      className={cn(
        "group/sidebar relative sticky top-0 hidden h-svh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear md:flex",
        state === "collapsed" ? "w-[var(--sidebar-width-icon)]" : "w-[var(--sidebar-width)]",
        className,
      )}
      {...props}
    >
      <div className="flex h-full w-full flex-col">{children}</div>
    </aside>
  );
}

export const SidebarTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof Button>
>(function SidebarTrigger({ className, onClick, ...props }, ref) {
  const { toggleSidebar, isMobile, open, openMobile } = useSidebar();

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon-sm"
      className={cn("shrink-0", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      aria-label="Toggle sidebar"
      aria-expanded={isMobile ? openMobile : open}
      aria-controls={isMobile ? "app-sidebar-mobile" : "app-sidebar"}
      {...props}
    >
      <PanelLeft size={16} aria-hidden="true" />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  );
});

export function SidebarInset({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { state } = useSidebar();

  return (
    <div
      data-slot="sidebar-inset"
      className={cn(
        "relative flex min-h-svh min-w-0 flex-1 flex-col bg-background md:my-2 md:mr-2 md:min-h-[calc(100svh-1rem)] md:rounded-2xl md:border md:border-border",
        state === "collapsed" ? "md:ml-2" : "md:ml-0",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", className)}
      {...props}
    />
  );
}

export function SidebarGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

export const sidebarGroupLabelClass = [
  "flex h-8 w-full shrink-0 items-center rounded-lg px-3 text-xs font-medium text-sidebar-foreground/60 outline-none transition-colors",
  "group-data-[collapsible=icon]/sidebar:hidden",
  "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
].join(" ");

export function SidebarMenu({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("flex w-full min-w-0 flex-col gap-0.5", className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  [
    "peer/menu-button group/menu-button flex w-full cursor-pointer select-none items-center gap-2.5 overflow-hidden rounded-lg px-3 text-left text-sm font-medium outline-none transition-[width,height,padding,background-color,color]",
    "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    "data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground",
    "[&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0",
    "group-data-[collapsible=icon]/sidebar:h-8 group-data-[collapsible=icon]/sidebar:w-8 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:p-0",
  ].join(" "),
  {
    variants: {
      size: {
        default: "h-9",
        sm: "h-8 text-xs",
        lg: "h-14",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

interface SidebarMenuButtonProps extends ComponentPropsWithoutRef<"button"> {
  asChild?: boolean;
  isActive?: boolean;
  size?: "default" | "sm" | "lg";
  tooltip?: string;
}

export const SidebarMenuButton = forwardRef<HTMLElement, SidebarMenuButtonProps>(
  function SidebarMenuButton(
    { asChild = false, isActive = false, size = "default", tooltip, className, children, ...props },
    ref,
  ) {
    const { state, isMobile } = useSidebar();
    const classes = cn(sidebarMenuButtonVariants({ size }), className);

    const button = asChild ? (
      <Slot ref={ref} data-active={isActive ? "true" : "false"} className={classes} {...props}>
        {children}
      </Slot>
    ) : (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        data-active={isActive ? "true" : "false"}
        className={classes}
        {...props}
      >
        {children}
      </button>
    );

    if (!tooltip || state !== "collapsed" || isMobile) {
      return button;
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" align="center">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  },
);

export function SidebarRail({ className, ...props }: ComponentPropsWithoutRef<"button">) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      data-slot="sidebar-rail"
      aria-label="Toggle sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle sidebar"
      className={cn(
        "absolute inset-y-0 -right-2 z-20 hidden w-4 cursor-pointer transition-colors md:block",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-px hover:after:bg-sidebar-border",
        className,
      )}
      {...props}
    />
  );
}
