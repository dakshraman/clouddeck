import { useId, type SVGProps } from "react";
import { cn } from "@/components/ui/cn";

export interface CloudDeckLogoProps extends Omit<SVGProps<SVGSVGElement>, "size"> {
  /**
   * Width and height of the icon (in pixels or CSS length).
   * @default 24
   */
  size?: number | string;

  /**
   * "mark": Transparent 3-tier isometric deck, inherits currentColor by default.
   * "badge": Complete squircle app icon tile with deep slate foundation and brand cyan deck.
   * @default "mark"
   */
  variant?: "mark" | "badge";

  /**
   * Force signature CloudDeck cyan (#1cc8e8) instead of currentColor when variant="mark".
   * @default false
   */
  useBrandColors?: boolean;

  /**
   * If true, renders the logo beside the "CloudDeck" brand text and optional subtitle.
   * @default false
   */
  showText?: boolean;

  /**
   * Optional subtitle shown beneath "CloudDeck" when showText is true (e.g. "Hosting console").
   */
  subtitle?: string;

  /**
   * Additional classes for the text container when showText is true.
   */
  textClassName?: string;

  /**
   * Additional classes for the outer wrapper when showText is true.
   */
  containerClassName?: string;
}

export function CloudDeckLogo({
  size = 24,
  variant = "mark",
  useBrandColors = false,
  showText = false,
  subtitle,
  className,
  textClassName,
  containerClassName,
  ...svgProps
}: CloudDeckLogoProps) {
  const reactId = useId();
  const bgId = `cd-bg-${reactId}`;
  const borderId = `cd-border-${reactId}`;
  const deckId = `cd-deck-${reactId}`;

  const isBadge = variant === "badge";
  const markFill = useBrandColors || isBadge ? "#1cc8e8" : "currentColor";
  const markStroke = useBrandColors || isBadge ? "#1cc8e8" : "currentColor";

  const svgElement = isBadge ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="CloudDeck"
      className={cn("shrink-0", !showText && className)}
      {...svgProps}
    >
      <defs>
        <linearGradient id={bgId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#09181f" />
          <stop offset="100%" stopColor="#050d11" />
        </linearGradient>
        <linearGradient id={borderId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.36} />
          <stop offset="100%" stopColor="#0e7490" stopOpacity={0.12} />
        </linearGradient>
        <linearGradient id={deckId} x1="10" y1="13" x2="54" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#1cc8e8" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${bgId})`} />
      <rect
        x="1"
        y="1"
        width="62"
        height="62"
        rx="15"
        fill="none"
        stroke={`url(#${borderId})`}
        strokeWidth="1.2"
      />
      <path d="M32 13 54 24.5 32 36 10 24.5 32 13Z" fill={`url(#${deckId})`} />
      <path
        d="M10 32.5 32 44 54 32.5"
        fill="none"
        stroke="#1cc8e8"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.75"
      />
      <path
        d="M10 41 32 52.5 54 41"
        fill="none"
        stroke="#1cc8e8"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.42"
      />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label="CloudDeck"
      className={cn("shrink-0", !showText && className)}
      {...svgProps}
    >
      <path d="M24 8 43 18 24 28 5 18 24 8Z" fill={markFill} />
      <path
        d="M5 25 24 35 43 25"
        fill="none"
        stroke={markStroke}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.72"
      />
      <path
        d="M5 32 24 42 43 32"
        fill="none"
        stroke={markStroke}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.4"
      />
    </svg>
  );

  if (!showText) {
    return svgElement;
  }

  return (
    <div className={cn("inline-flex items-center gap-2.5", containerClassName ?? className)}>
      {svgElement}
      <div className={cn("grid min-w-0 leading-tight", textClassName)}>
        <span className="truncate font-semibold tracking-tight text-foreground">
          CloudDeck
        </span>
        {subtitle && (
          <span className="truncate text-[11px] text-muted-foreground">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

export const CloudDeckMark = CloudDeckLogo;
