import { useState } from "react";
import type { AgentService, ServiceState } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { titleCase } from "@/components/format";
import { Play, RotateCw, Square, Wrench, X, Copy, Check } from "lucide-react";

const stateVariant: Record<ServiceState, BadgeVariant> = {
  running: "green",
  stopped: "red",
  unknown: "neutral",
};

interface ServiceCardProps {
  service: AgentService;
  actionInFlight: "restart" | "stop" | "start" | "repair" | null;
  disabled: boolean;
  error: string | null;
  onRestart: () => void;
  onStop: () => void;
  onStart: () => void;
  onRepair?: () => void;
  onDismissError?: () => void;
}

export function ServiceCard({
  service,
  actionInFlight,
  disabled,
  error,
  onRestart,
  onStop,
  onStart,
  onRepair,
  onDismissError,
}: ServiceCardProps) {
  const [copied, setCopied] = useState(false);
  const isMasked = error?.toLowerCase().includes("masked");
  const isUnitConflict =
    error?.toLowerCase().includes("failed to load") ||
    error?.toLowerCase().includes("file exists") ||
    error?.toLowerCase().includes("reload service manager");

  const recoveryCmd = isMasked
    ? `sudo systemctl unmask ${service.name} && sudo systemctl daemon-reload && sudo systemctl start ${service.name}`
    : isUnitConflict
      ? `sudo systemctl daemon-reload && sudo systemctl reset-failed mysql mariadb && sudo systemctl start mariadb || sudo systemctl start mysql`
      : null;

  function copyCmd() {
    if (!recoveryCmd) return;
    void navigator.clipboard.writeText(recoveryCmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{service.label}</CardTitle>
          <CardDescription className="font-mono">{service.name}</CardDescription>
        </div>
        <Badge variant={stateVariant[service.state]}>{titleCase(service.state)}</Badge>
      </CardHeader>
      <CardBody className="flex flex-1 flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <dt className="text-xs text-muted-foreground">PID</dt>
            <dd className="mt-1 font-mono text-sm text-foreground">{service.pid ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Version</dt>
            <dd className="mt-1 truncate font-mono text-sm text-foreground" title={service.version}>
              {service.version ?? "—"}
            </dd>
          </div>
        </dl>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Details</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">{service.details ?? "—"}</p>
        </div>

        {error ? (
          <div className="space-y-1.5">
            <Alert variant="error" className="relative pr-8">
              {onDismissError ? (
                <button
                  type="button"
                  onClick={onDismissError}
                  className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  aria-label="Dismiss error"
                  title="Dismiss error"
                >
                  <X size={14} />
                </button>
              ) : null}
              <div className="space-y-1.5">
                <p className="break-words font-medium">{error}</p>
                {isMasked ? (
                  <p className="text-xs opacity-90">
                    Unit is masked by systemd. Click <strong>Auto-Fix &amp; Unmask</strong> below or run the command on the host.
                  </p>
                ) : null}
                {isUnitConflict ? (
                  <p className="text-xs opacity-90">
                    Systemd unit collision or reload required. Click <strong>Auto-Fix &amp; Reload</strong> below or run the command on the host.
                  </p>
                ) : null}
                {recoveryCmd ? (
                  <div className="mt-2 flex items-center gap-2 rounded bg-black/40 px-2 py-1 font-mono text-xs text-foreground/90">
                    <span className="flex-1 truncate">{recoveryCmd}</span>
                    <button
                      type="button"
                      onClick={copyCmd}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      title="Copy command"
                    >
                      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : null}
              </div>
            </Alert>
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {actionInFlight ? (
            <span className="flex h-8 items-center gap-2 text-xs text-muted-foreground">
              <Spinner size={14} className="text-muted-foreground" />
              {actionInFlight === "restart"
                ? "restarting…"
                : actionInFlight === "stop"
                  ? "stopping…"
                  : actionInFlight === "repair"
                    ? "auto-fixing…"
                    : "starting…"}
            </span>
          ) : (
            <>
              {error && onRepair ? (
                <Button variant="primary" size="sm" disabled={disabled} onClick={onRepair}>
                  <Wrench size={14} aria-hidden="true" />
                  {isMasked ? "Auto-Fix & Unmask" : isUnitConflict ? "Auto-Fix & Reload" : "Auto-Fix & Start"}
                </Button>
              ) : null}

              {service.state === "stopped" ? (
                <Button variant={error ? "secondary" : "primary"} size="sm" disabled={disabled} onClick={onStart}>
                  <Play size={14} aria-hidden="true" />
                  {error ? "Retry Start" : "Start"}
                </Button>
              ) : null}

              {service.state === "running" || service.state === "unknown" ? (
                <Button variant="secondary" size="sm" disabled={disabled} onClick={onRestart}>
                  <RotateCw size={14} aria-hidden="true" />
                  Restart
                </Button>
              ) : null}

              {service.state === "running" || service.state === "unknown" ? (
                <Button variant="danger" size="sm" disabled={disabled} onClick={onStop}>
                  <Square size={14} aria-hidden="true" />
                  Stop
                </Button>
              ) : null}
            </>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
