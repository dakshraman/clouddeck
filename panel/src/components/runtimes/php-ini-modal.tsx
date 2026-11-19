"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { PhpConfigResponse, SetPhpConfigResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertCircle,
  Check,
  Clock,
  Database,
  FileCode,
  HardDrive,
  RotateCcw,
  Save,
  Sliders,
  Upload,
  X,
} from "lucide-react";

interface PhpIniModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialVersion?: string;
  versionsList?: string[];
  onSaved?: () => void;
}

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const PRESETS = {
  upload_max_filesize: ["16M", "32M", "64M", "128M", "256M", "512M", "1G"],
  post_max_size: ["16M", "32M", "64M", "128M", "256M", "512M", "1G"],
  memory_limit: ["128M", "256M", "512M", "1024M", "2048M", "-1"],
  max_execution_time: ["30", "60", "120", "300", "600"],
  max_input_vars: ["1000", "2000", "3000", "5000", "10000"],
};

const DEFAULT_RECOMMENDED: Record<string, string> = {
  upload_max_filesize: "64M",
  post_max_size: "64M",
  memory_limit: "256M",
  max_execution_time: "60",
  max_input_vars: "3000",
  display_errors: "Off",
  "date.timezone": "UTC",
};

export function PhpIniModal({
  open,
  onOpenChange,
  initialVersion = "8.4",
  versionsList = ["8.4", "8.3", "8.2", "8.1"],
  onSaved,
}: PhpIniModalProps) {
  const [version, setVersion] = useState<string>(initialVersion);
  const [filePath, setFilePath] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Directives
  const [uploadMaxFilesize, setUploadMaxFilesize] = useState("64M");
  const [postMaxSize, setPostMaxSize] = useState("64M");
  const [memoryLimit, setMemoryLimit] = useState("256M");
  const [maxExecutionTime, setMaxExecutionTime] = useState("60");
  const [maxInputVars, setMaxInputVars] = useState("1000");
  const [displayErrors, setDisplayErrors] = useState("Off");
  const [timezone, setTimezone] = useState("UTC");

  const loadConfig = useCallback(async (v: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch<PhpConfigResponse>(
        `/api/runtimes/php/config?version=${encodeURIComponent(v)}`,
      );
      setFilePath(res.path || "");
      const d = res.directives || {};
      setUploadMaxFilesize(d["upload_max_filesize"] || "64M");
      setPostMaxSize(d["post_max_size"] || "64M");
      setMemoryLimit(d["memory_limit"] || "256M");
      setMaxExecutionTime(d["max_execution_time"] || "60");
      setMaxInputVars(d["max_input_vars"] || "1000");
      setDisplayErrors(d["display_errors"] || "Off");
      setTimezone(d["date.timezone"] || d["date_timezone"] || "UTC");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load php.ini configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      const activeVer = initialVersion || "8.4";
      setVersion(activeVer);
      void loadConfig(activeVer);
    }
  }, [open, initialVersion, loadConfig]);

  const handleVersionChange = (newVer: string) => {
    setVersion(newVer);
    void loadConfig(newVer);
  };

  const handleResetDefaults = () => {
    setUploadMaxFilesize(DEFAULT_RECOMMENDED["upload_max_filesize"]);
    setPostMaxSize(DEFAULT_RECOMMENDED["post_max_size"]);
    setMemoryLimit(DEFAULT_RECOMMENDED["memory_limit"]);
    setMaxExecutionTime(DEFAULT_RECOMMENDED["max_execution_time"]);
    setMaxInputVars(DEFAULT_RECOMMENDED["max_input_vars"]);
    setDisplayErrors(DEFAULT_RECOMMENDED["display_errors"]);
    setTimezone(DEFAULT_RECOMMENDED["date.timezone"]);
    setSuccess("Reset to recommended production defaults (click Save & Reload FPM to apply).");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const directives: Record<string, string> = {
      upload_max_filesize: uploadMaxFilesize.trim(),
      post_max_size: postMaxSize.trim(),
      memory_limit: memoryLimit.trim(),
      max_execution_time: maxExecutionTime.trim(),
      max_input_vars: maxInputVars.trim(),
      display_errors: displayErrors.trim(),
      "date.timezone": timezone.trim(),
    };

    try {
      const res = await apiPost<SetPhpConfigResponse>("/api/runtimes/php/config", {
        version,
        directives,
      });
      if (res.success) {
        setSuccess(`PHP ${version} configuration saved and php-fpm service reloaded successfully.`);
        if (onSaved) onSaved();
      } else {
        setError("Failed to save php.ini settings.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update PHP configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-popover p-6 shadow-2xl focus:outline-none"
          aria-describedby="php-ini-modal-desc"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                <Sliders size={20} aria-hidden="true" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-foreground">
                  Visual php.ini Editor
                </Dialog.Title>
                <p id="php-ini-modal-desc" className="text-xs text-muted-foreground">
                  Tune core runtime directives, memory limits, and file size quotas with automated FPM reload.
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          {/* PHP Version & File Path Bar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">PHP Branch:</span>
              <Select
                value={version}
                disabled={loading || saving}
                onChange={(e) => handleVersionChange(e.target.value)}
                className="w-28 font-mono text-xs"
              >
                {versionsList.map((v) => (
                  <option key={v} value={v}>
                    PHP {v}
                  </option>
                ))}
              </Select>
            </div>
            {filePath ? (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <FileCode size={13} className="shrink-0" />
                <span className="truncate font-mono">{filePath}</span>
              </div>
            ) : null}
          </div>

          {/* Notifications */}
          {error ? (
            <Alert variant="error" className="mt-4 text-xs">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </Alert>
          ) : null}
          {success ? (
            <Alert variant="success" className="mt-4 text-xs">
              <Check size={14} className="shrink-0" />
              <span>{success}</span>
            </Alert>
          ) : null}

          {/* Form */}
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <Spinner size={24} />
              <p className="text-xs text-muted-foreground">Reading {filePath || "php.ini"}...</p>
            </div>
          ) : (
            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* upload_max_filesize */}
                <div className="space-y-1.5 rounded-lg border border-border/80 bg-card/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Upload size={13} className="text-muted-foreground" />
                      upload_max_filesize
                    </Label>
                    <Badge variant="neutral" className="font-mono text-[10px]">
                      {uploadMaxFilesize}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Maximum size of an uploaded file.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={uploadMaxFilesize}
                      onChange={(e) => setUploadMaxFilesize(e.target.value)}
                      placeholder="64M"
                      className="font-mono text-xs"
                    />
                    <Select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setUploadMaxFilesize(e.target.value);
                      }}
                      className="w-28 text-xs"
                    >
                      <option value="">Preset…</option>
                      {PRESETS.upload_max_filesize.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* post_max_size */}
                <div className="space-y-1.5 rounded-lg border border-border/80 bg-card/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <HardDrive size={13} className="text-muted-foreground" />
                      post_max_size
                    </Label>
                    <Badge variant="neutral" className="font-mono text-[10px]">
                      {postMaxSize}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Max size of POST data (should be &gt;= upload size).
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={postMaxSize}
                      onChange={(e) => setPostMaxSize(e.target.value)}
                      placeholder="64M"
                      className="font-mono text-xs"
                    />
                    <Select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setPostMaxSize(e.target.value);
                      }}
                      className="w-28 text-xs"
                    >
                      <option value="">Preset…</option>
                      {PRESETS.post_max_size.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* memory_limit */}
                <div className="space-y-1.5 rounded-lg border border-border/80 bg-card/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Database size={13} className="text-muted-foreground" />
                      memory_limit
                    </Label>
                    <Badge variant="neutral" className="font-mono text-[10px]">
                      {memoryLimit}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Max amount of memory a script may allocate (-1 for unlimited).
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={memoryLimit}
                      onChange={(e) => setMemoryLimit(e.target.value)}
                      placeholder="256M"
                      className="font-mono text-xs"
                    />
                    <Select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setMemoryLimit(e.target.value);
                      }}
                      className="w-28 text-xs"
                    >
                      <option value="">Preset…</option>
                      {PRESETS.memory_limit.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* max_execution_time */}
                <div className="space-y-1.5 rounded-lg border border-border/80 bg-card/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Clock size={13} className="text-muted-foreground" />
                      max_execution_time
                    </Label>
                    <Badge variant="neutral" className="font-mono text-[10px]">
                      {maxExecutionTime}s
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Max script execution duration before termination (seconds).
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={maxExecutionTime}
                      onChange={(e) => setMaxExecutionTime(e.target.value)}
                      placeholder="60"
                      className="font-mono text-xs"
                    />
                    <Select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setMaxExecutionTime(e.target.value);
                      }}
                      className="w-28 text-xs"
                    >
                      <option value="">Preset…</option>
                      {PRESETS.max_execution_time.map((p) => (
                        <option key={p} value={p}>
                          {p}s
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* max_input_vars */}
                <div className="space-y-1.5 rounded-lg border border-border/80 bg-card/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Sliders size={13} className="text-muted-foreground" />
                      max_input_vars
                    </Label>
                    <Badge variant="neutral" className="font-mono text-[10px]">
                      {maxInputVars}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Max input variables accepted via GET/POST/cookies.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={maxInputVars}
                      onChange={(e) => setMaxInputVars(e.target.value)}
                      placeholder="1000"
                      className="font-mono text-xs"
                    />
                    <Select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setMaxInputVars(e.target.value);
                      }}
                      className="w-28 text-xs"
                    >
                      <option value="">Preset…</option>
                      {PRESETS.max_input_vars.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* display_errors */}
                <div className="space-y-1.5 rounded-lg border border-border/80 bg-card/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <AlertCircle size={13} className="text-muted-foreground" />
                      display_errors
                    </Label>
                    <Badge
                      variant={displayErrors.toLowerCase() === "on" ? "amber" : "neutral"}
                      className="font-mono text-[10px]"
                    >
                      {displayErrors}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Print errors to screen. Off is recommended for production security.
                  </p>
                  <Select
                    value={displayErrors}
                    onChange={(e) => setDisplayErrors(e.target.value)}
                    className="w-full text-xs"
                  >
                    <option value="Off">Off (Production Safe)</option>
                    <option value="On">On (Debug / Development)</option>
                  </Select>
                </div>
              </div>

              {/* date.timezone */}
              <div className="space-y-1.5 rounded-lg border border-border/80 bg-card/60 p-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Clock size={13} className="text-muted-foreground" />
                    date.timezone
                  </Label>
                  <Badge variant="neutral" className="font-mono text-[10px]">
                    {timezone}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Default server timezone used by all date/time functions.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Select
                    value={COMMON_TIMEZONES.includes(timezone) ? timezone : ""}
                    onChange={(e) => {
                      if (e.target.value) setTimezone(e.target.value);
                    }}
                    className="text-xs"
                  >
                    <option value="">Select common timezone…</option>
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="Custom timezone (e.g. UTC)"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={loading || saving}
                  onClick={handleResetDefaults}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  Recommended Defaults
                </Button>

                <div className="flex items-center gap-2">
                  <Dialog.Close asChild>
                    <Button type="button" variant="secondary" size="sm" disabled={saving}>
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={saving}
                    disabled={loading || saving}
                    className="gap-1.5 text-xs shadow-sm"
                  >
                    <Save size={13} aria-hidden="true" />
                    Save &amp; Reload FPM
                  </Button>
                </div>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
