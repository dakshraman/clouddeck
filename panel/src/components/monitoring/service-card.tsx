import type { AgentService, ServiceState } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { titleCase } from "@/components/format";
import { Play, RotateCw, Square } from "lucide-react";

const stateVariant: Record<ServiceState, BadgeVariant> = {
  running: "green",
  stopped: "red",
  unknown: "neutral",
};

interface ServiceCardProps {
  service: AgentService;
  actionInFlight: "restart" | "stop" | "start" | null;
  disabled: boolean;
  error: string | null;
  onRestart: () => void;
  onStop: () => void;
  onStart: () => void;
}

export function ServiceCard({
  service,
  actionInFlight,
  disabled,
  error,
  onRestart,
  onStop,
  onStart,
}: ServiceCardProps) {
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

        {error ? <Alert variant="error">{error}</Alert> : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {actionInFlight ? (
            <span className="flex h-8 items-center gap-2 text-xs text-muted-foreground">
              <Spinner size={14} className="text-muted-foreground" />
              {actionInFlight === "restart"
                ? "restarting…"
                : actionInFlight === "stop"
                  ? "stopping…"
                  : "starting…"}
            </span>
          ) : (
            <>
              {service.state === "stopped" ? (
                <Button variant="primary" size="sm" disabled={disabled} onClick={onStart}>
                  <Play size={14} aria-hidden="true" />
                  Start
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
