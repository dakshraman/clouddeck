"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { PhpVersionsResponse, Task } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { TaskLog } from "@/components/task-log";

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export default function NewSitePage() {
  const [domain, setDomain] = useState("");
  const [phpVersion, setPhpVersion] = useState("none");
  const [versions, setVersions] = useState<string[] | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [createdDomain, setCreatedDomain] = useState("");
  const [result, setResult] = useState<"succeeded" | "failed" | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    setVersions(null);
    setVersionsError(null);
    try {
      const data = await apiFetch<PhpVersionsResponse>("/api/php-versions");
      setVersions(data.versions.filter((version) => version !== "none"));
    } catch (error) {
      setVersionsError(error instanceof Error ? error.message : "Failed to load PHP versions");
    }
  }, []);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = domain.trim().toLowerCase();
    if (!DOMAIN_PATTERN.test(normalized)) {
      setFormError("Enter a valid domain, like example.com (letters, numbers and hyphens, at least two labels).");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const data = await apiPost<{ taskId: string }>("/api/sites", {
        domain: normalized,
        phpVersion,
      });
      setCreatedDomain(normalized);
      setTaskId(data.taskId);
      setResult(null);
      setTaskError(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to create site");
    } finally {
      setSubmitting(false);
    }
  }

  function onTaskDone(task: Task) {
    if (task.status === "succeeded") {
      setResult("succeeded");
    } else {
      setResult("failed");
      setTaskError(task.error ?? "The task failed. Check the log for details.");
    }
  }

  function backToForm() {
    setTaskId(null);
    setResult(null);
    setTaskError(null);
    setFormError(null);
  }

  function createAnother() {
    setDomain("");
    setPhpVersion("none");
    backToForm();
  }

  if (taskId) {
    return (
      <>
        <PageHeader
          title={`Creating ${createdDomain}`}
          description="The site is being provisioned. This usually takes a few seconds."
        />

        {result === "succeeded" ? (
          <Alert variant="success" className="mb-5">
            Site created successfully. It is ready to receive traffic.
          </Alert>
        ) : null}

        {result === "failed" ? (
          <Alert variant="error" className="mb-5">
            {taskError}
          </Alert>
        ) : null}

        <TaskLog taskId={taskId} onComplete={onTaskDone} />

        {result === "succeeded" ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/sites/${encodeURIComponent(createdDomain)}`} className={buttonClass("primary", "md")}>
              Open site
            </Link>
            <Button variant="secondary" onClick={createAnother}>
              Create another
            </Button>
          </div>
        ) : null}

        {result === "failed" ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={backToForm}>
              Try again
            </Button>
            <Link href="/sites" className={buttonClass("ghost", "md")}>
              Back to sites
            </Link>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New site"
        description="Create a site with its own webroot and nginx configuration."
      />

      <Card className="max-w-2xl">
        <CardBody>
          <form onSubmit={onSubmit} className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="example.com"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                required
                disabled={submitting}
                className="font-mono"
              />
              <p className="text-xs text-slate-500">
                Lowercase letters, numbers and hyphens per label, separated by dots — e.g.
                example.com. No protocol, port or trailing dot.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="phpVersion">PHP version</Label>
              <Select
                id="phpVersion"
                value={phpVersion}
                onChange={(event) => setPhpVersion(event.target.value)}
                disabled={submitting || versions === null}
              >
                <option value="none">Static (no PHP)</option>
                {versions?.map((version) => (
                  <option key={version} value={version}>
                    PHP {version}
                  </option>
                ))}
                {versions === null && !versionsError ? (
                  <option value="none">Loading PHP versions…</option>
                ) : null}
              </Select>
              {versionsError ? (
                <p className="flex flex-wrap items-center gap-2 text-xs text-red-400">
                  {versionsError}
                  <button
                    type="button"
                    onClick={() => void loadVersions()}
                    className="cursor-pointer text-indigo-300 underline-offset-2 hover:underline"
                  >
                    Retry
                  </button>
                </p>
              ) : null}
            </div>

            {formError ? <Alert variant="error">{formError}</Alert> : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={submitting}>
                Create site
              </Button>
              <Link href="/sites" className={buttonClass("ghost", "md")}>
                Cancel
              </Link>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
