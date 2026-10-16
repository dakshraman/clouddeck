"use client";

import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

function crumbsFor(pathname: string): string[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return ["Dashboard"];
  return segments.map((segment) => {
    if (segment === "sites") return "Sites";
    if (segment === "settings") return "Settings";
    if (segment === "new") return "New site";
    return decodeURIComponent(segment);
  });
}

export function Topbar() {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-800 bg-[#0B0F17]/80 px-8 backdrop-blur">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <span key={`${crumb}-${index}`} className="flex min-w-0 items-center gap-2">
              {index > 0 ? (
                <ChevronRight size={14} className="shrink-0 text-slate-600" aria-hidden="true" />
              ) : null}
              <span className={last ? "truncate font-medium text-slate-200" : "truncate text-slate-500"}>
                {crumb}
              </span>
            </span>
          );
        })}
      </nav>
    </header>
  );
}
