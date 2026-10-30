"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  MySQLDatabase,
  MySQLListDatabasesResponse,
  MySQLListUsersResponse,
  MySQLStatus,
  MySQLUser,
  PmaStatusResponse,
} from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { DatabasesCard } from "@/components/databases/databases-card";
import { UsersCard } from "@/components/databases/users-card";
import { PmaCard } from "./pma-card";
import { RemoteMysqlCard } from "./remote-mysql-card";

type LoadState = "loading" | "ready" | "error";

export default function DatabasesPage() {
  const [status, setStatus] = useState<MySQLStatus | null>(null);
  const [databases, setDatabases] = useState<MySQLDatabase[] | null>(null);
  const [users, setUsers] = useState<MySQLUser[] | null>(null);
  const [pmaStatus, setPmaStatus] = useState<PmaStatusResponse | null>(null);
  const [databasesError, setDatabasesError] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setState("loading");
    setErrorMessage(null);

    const [statusResult, databasesResult, usersResult, pmaResult] = await Promise.allSettled([
      apiFetch<MySQLStatus>("/api/mysql/status"),
      apiFetch<MySQLListDatabasesResponse>("/api/mysql/databases"),
      apiFetch<MySQLListUsersResponse>("/api/mysql/users"),
      apiFetch<PmaStatusResponse>("/api/phpmyadmin/status"),
    ]);

    if (statusResult.status === "rejected") {
      setState("error");
      setErrorMessage(
        statusResult.reason instanceof Error
          ? statusResult.reason.message
          : "Cannot reach the CloudDeck agent",
      );
      return;
    }

    setStatus(statusResult.value);

    if (pmaResult.status === "fulfilled") {
      setPmaStatus(pmaResult.value);
    }

    if (databasesResult.status === "fulfilled") {
      setDatabases(databasesResult.value.databases);
      setDatabasesError(null);
    } else {
      setDatabasesError(
        databasesResult.reason instanceof Error
          ? databasesResult.reason.message
          : "Failed to load databases",
      );
    }

    if (usersResult.status === "fulfilled") {
      setUsers(usersResult.value.users);
      setUsersError(null);
    } else {
      setUsersError(
        usersResult.reason instanceof Error ? usersResult.reason.message : "Failed to load users",
      );
    }

    setState("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load({ silent: true });
  }, [load]);

  const available = status?.available === true;

  return (
    <>
      <PageHeader
        title="Databases"
        description="MariaDB/MySQL databases and users on this server."
        actions={
          status?.available ? (
            <Badge variant="green">{status.version ? status.version : "Connected"}</Badge>
          ) : undefined
        }
      />

      {state === "error" ? (
        <Alert variant="error" className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage ?? "Cannot reach the CloudDeck agent"}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {state === "ready" && status && !status.available ? (
        <Alert variant="info" className="mb-6">
          <p className="font-medium">The agent cannot reach MariaDB/MySQL.</p>
          <p className="mt-1">
            Database and user management is disabled. Make sure the database server is running, and
            check the agent configuration: the client binary path (
            <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-xs text-foreground">
              AGENT_MYSQL_BIN
            </code>
            ) and the root credentials (
            <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-xs text-foreground">
              AGENT_MYSQL_ROOT_USER
            </code>{" "}
            /{" "}
            <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-xs text-foreground">
              AGENT_MYSQL_ROOT_PASSWORD
            </code>
            ) may need to be configured.
          </p>
        </Alert>
      ) : null}

      {state === "loading" ? (
        <>
          <Card className="p-5">
            <div className="grid gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </Card>
          <Card className="mt-6 p-5">
            <div className="grid gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </Card>
        </>
      ) : null}

      {state === "ready" ? (
        <>
          <DatabasesCard
            databases={databases}
            error={databasesError}
            disabled={!available}
            onRefresh={refresh}
            pmaInstalled={Boolean(pmaStatus?.installed)}
          />
          <div className="mt-6">
            <UsersCard
              users={users}
              databases={databases}
              error={usersError}
              disabled={!available}
              onRefresh={refresh}
            />
          </div>
          {pmaStatus && !pmaStatus.installed ? (
            <div className="mt-6">
              <PmaCard onInstalled={refresh} />
            </div>
          ) : null}
          <div className="mt-6">
            <RemoteMysqlCard />
          </div>
        </>
      ) : null}
    </>
  );
}
