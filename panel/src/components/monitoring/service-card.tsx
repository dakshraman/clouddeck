import type { AgentService, ServiceState } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { titleCase } from "@/components/format";
import { RotateCw } from "lucide-react";

const stateVariant: Record<ServiceState, BadgeVariant> = {
  running: "green",
  stopped: "red",
  unknown: "neutral",
};

interface ServiceCardProps {
  service: AgentService;
  restarting: boolean;
  restartDisabled: boolean;
  error: string | null;
  onRestart: () => void;
}

export function ServiceCard({
  service,
  restarting,
  restartDisabled,
  error,
  onRestart,
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
            <dt className="text-xs text-slate-500">PID</dt>
            <dd className="mt-1 font-mono text-sm text-slate-200">{service.pid ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Version</dt>
            <dd className="mt-1 truncate font-mono text-sm text-slate-200" title={service.version}>
              {service.version ?? "—"}
            </dd>
          </div>
        </dl>

        <div className="min-w-0">
          <p className="text-xs text-slate-500">Details</p>
          <p className="mt-1 break-words text-sm text-slate-400">{service.details ?? "—"}</p>
        </div>

        {error ? <Alert variant="error">{error}</Alert> : null}

        <div className="mt-auto pt-1">
          {restarting ? (
            <span className="flex h-8 items-center gap-2 text-xs text-slate-400">
              <Spinner size={14} className="text-slate-400" />
              restarting…
            </span>
          ) : (
            <Button variant="secondary" size="sm" disabled={restartDisabled} onClick={onRestart}>
              <RotateCw size={14} aria-hidden="true" />
              Restart
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
