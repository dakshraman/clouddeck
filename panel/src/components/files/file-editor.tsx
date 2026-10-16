"use client";

import { useCallback, useEffect, useState } from "react";
import type { FileContentResponse, FileWriteResponse } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save } from "lucide-react";

interface FileEditorProps {
  domain: string;
  path: string;
  name: string;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function FileEditor({ domain, path, name, isNew, onClose, onSaved }: FileEditorProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const contentUrl = `/api/sites/${encodeURIComponent(domain)}/files/content?path=${encodeURIComponent(path)}`;

  const loadContent = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<FileContentResponse>(contentUrl);
      setContent(data.content);
      setSaved(false);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load the file");
    } finally {
      setLoading(false);
    }
  }, [contentUrl]);

  useEffect(() => {
    if (!isNew) void loadContent();
  }, [isNew, loadContent]);

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch<FileWriteResponse>(contentUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      setSaved(true);
      onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save the file");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="truncate font-mono">{name}</CardTitle>
          <CardDescription className="break-all font-mono">{path}</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            <ArrowLeft size={14} aria-hidden="true" />
            Cancel
          </Button>
          <Button
            size="sm"
            loading={saving}
            disabled={loading || loadError !== null}
            onClick={() => void onSave()}
          >
            {saving ? null : <Save size={14} aria-hidden="true" />}
            Save
          </Button>
        </div>
      </CardHeader>
      <CardBody className="grid gap-4">
        {saveError ? <Alert variant="error">{saveError}</Alert> : null}
        {saved ? <Alert variant="success">Saved.</Alert> : null}
        {loadError ? (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="break-all">{loadError}</span>
              <Button variant="secondary" size="sm" onClick={() => void loadContent()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : null}
        {loading ? (
          <Skeleton className="h-96" />
        ) : loadError ? null : (
          <textarea
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setSaved(false);
            }}
            spellCheck={false}
            aria-label={`Edit ${name}`}
            className="h-96 w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 p-3 font-mono text-xs leading-relaxed text-slate-200 transition-colors placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        )}
      </CardBody>
    </Card>
  );
}
