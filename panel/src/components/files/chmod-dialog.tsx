"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@animate-ui/react/primitives/radix-ui/dialog";
import type { FileEntry } from "@/lib/types";
import { apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Check,
  Folder,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { FileGlyph } from "@/components/files/file-icons";

interface PermissionGroup {
  read: boolean;
  write: boolean;
  execute: boolean;
}

interface Permissions {
  owner: PermissionGroup;
  group: PermissionGroup;
  others: PermissionGroup;
}

export interface ChmodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  entry: FileEntry | null;
  currentPath: string;
  onSuccess: () => void;
}

function groupToOctal(group: PermissionGroup): number {
  return (group.read ? 4 : 0) + (group.write ? 2 : 0) + (group.execute ? 1 : 0);
}

function octalToGroup(digit: number): PermissionGroup {
  return {
    read: (digit & 4) !== 0,
    write: (digit & 2) !== 0,
    execute: (digit & 1) !== 0,
  };
}

function permsToOctalString(perms: Permissions): string {
  const o = groupToOctal(perms.owner);
  const g = groupToOctal(perms.group);
  const ot = groupToOctal(perms.others);
  return `0${o}${g}${ot}`;
}

function octalStringToPerms(str: string): Permissions | null {
  const clean = str.trim();
  if (!/^0?[0-7]{3}$/.test(clean)) return null;
  const digits = clean.length === 4 ? clean.slice(1) : clean;
  const o = parseInt(digits[0], 10);
  const g = parseInt(digits[1], 10);
  const ot = parseInt(digits[2], 10);
  return {
    owner: octalToGroup(o),
    group: octalToGroup(g),
    others: octalToGroup(ot),
  };
}

function permsToSymbolic(perms: Permissions, isDir: boolean): string {
  const formatGroup = (g: PermissionGroup) =>
    (g.read ? "r" : "-") + (g.write ? "w" : "-") + (g.execute ? "x" : "-");
  return `${isDir ? "d" : "-"}${formatGroup(perms.owner)}${formatGroup(perms.group)}${formatGroup(perms.others)}`;
}

export function ChmodDialog({
  open,
  onOpenChange,
  domain,
  entry,
  currentPath,
  onSuccess,
}: ChmodDialogProps) {
  const isDir = entry?.type === "dir";
  const defaultMode = isDir ? "0755" : "0644";

  const [modeInput, setModeInput] = useState(defaultMode);
  const [permissions, setPermissions] = useState<Permissions>(() =>
    octalStringToPerms(defaultMode)!,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Reset when dialog opens with a new entry
  useEffect(() => {
    if (open && entry) {
      const initial = entry.type === "dir" ? "0755" : "0644";
      setModeInput(initial);
      const parsed = octalStringToPerms(initial);
      if (parsed) setPermissions(parsed);
      setError(null);
      setSuccessNotice(null);
    }
  }, [open, entry]);

  if (!entry) return null;

  const targetPath = currentPath === "" ? entry.name : `${currentPath}/${entry.name}`;

  const updatePermission = (
    category: "owner" | "group" | "others",
    perm: "read" | "write" | "execute",
    value: boolean,
  ) => {
    const next: Permissions = {
      ...permissions,
      [category]: {
        ...permissions[category],
        [perm]: value,
      },
    };
    setPermissions(next);
    setModeInput(permsToOctalString(next));
    setError(null);
  };

  const handleModeInputChange = (val: string) => {
    setModeInput(val);
    const parsed = octalStringToPerms(val);
    if (parsed) {
      setPermissions(parsed);
      setError(null);
    }
  };

  const applyPreset = (presetMode: string) => {
    setModeInput(presetMode);
    const parsed = octalStringToPerms(presetMode);
    if (parsed) {
      setPermissions(parsed);
      setError(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanMode = modeInput.trim();
    if (!/^0?[0-7]{3}$/.test(cleanMode)) {
      setError("Please enter a valid octal mode, e.g. 0644 or 0755.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessNotice(null);

    try {
      await apiPost<{ path: string }>(
        `/api/sites/${encodeURIComponent(domain)}/files/chmod`,
        {
          path: targetPath,
          mode: cleanMode,
        },
      );

      setSuccessNotice(`Permissions updated to ${cleanMode} successfully.`);
      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change permissions");
    } finally {
      setBusy(false);
    }
  };

  const symbolic = permsToSymbolic(permissions, isDir);
  const isFullAccess = modeInput.endsWith("777");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm " />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-6 shadow-2xl focus:outline-none"
          aria-describedby="chmod-description"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <KeyRound size={20} aria-hidden="true" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-foreground">
                  Change File Permissions
                </Dialog.Title>
                <p id="chmod-description" className="text-xs text-muted-foreground">
                  Configure read, write, and execute permissions for user classes.
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

          <form onSubmit={handleSubmit} className="mt-4 space-y-5">
            {/* Target Item Info */}
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
              {entry.type === "dir" ? (
                <Folder size={18} className="shrink-0 text-brand/80" aria-hidden="true" />
              ) : (
                <FileGlyph name={entry.name} size={18} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs font-semibold text-foreground">
                  {entry.name}
                </p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  /{targetPath}
                </p>
              </div>
              <Badge variant="neutral">{entry.type}</Badge>
            </div>

            {error ? <Alert variant="error">{error}</Alert> : null}
            {successNotice ? (
              <Alert variant="success">
                <span className="flex items-center gap-1.5 font-medium">
                  <Check size={14} />
                  {successNotice}
                </span>
              </Alert>
            ) : null}

            {/* Visual Permissions Grid */}
            <div className="overflow-hidden rounded-lg border border-border bg-card/60">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                    <th className="px-3.5 py-2.5">User Class</th>
                    <th className="px-3 py-2.5 text-center">Read (4)</th>
                    <th className="px-3 py-2.5 text-center">Write (2)</th>
                    <th className="px-3 py-2.5 text-center">Execute (1)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {/* Owner */}
                  <tr className="hover:bg-muted/20">
                    <td className="px-3.5 py-2.5 font-medium text-foreground">
                      <div>Owner (User)</div>
                      <div className="text-[10px] text-muted-foreground">File creator</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={permissions.owner.read}
                        onChange={(e) => updatePermission("owner", "read", e.target.checked)}
                        disabled={busy}
                        aria-label="Owner Read"
                        className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={permissions.owner.write}
                        onChange={(e) => updatePermission("owner", "write", e.target.checked)}
                        disabled={busy}
                        aria-label="Owner Write"
                        className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={permissions.owner.execute}
                        onChange={(e) => updatePermission("owner", "execute", e.target.checked)}
                        disabled={busy}
                        aria-label="Owner Execute"
                        className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                      />
                    </td>
                  </tr>

                  {/* Group */}
                  <tr className="hover:bg-muted/20">
                    <td className="px-3.5 py-2.5 font-medium text-foreground">
                      <div>Group</div>
                      <div className="text-[10px] text-muted-foreground">Shared group</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={permissions.group.read}
                        onChange={(e) => updatePermission("group", "read", e.target.checked)}
                        disabled={busy}
                        aria-label="Group Read"
                        className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={permissions.group.write}
                        onChange={(e) => updatePermission("group", "write", e.target.checked)}
                        disabled={busy}
                        aria-label="Group Write"
                        className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={permissions.group.execute}
                        onChange={(e) => updatePermission("group", "execute", e.target.checked)}
                        disabled={busy}
                        aria-label="Group Execute"
                        className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                      />
                    </td>
                  </tr>

                  {/* Public / Others */}
                  <tr className="hover:bg-muted/20">
                    <td className="px-3.5 py-2.5 font-medium text-foreground">
                      <div>Public (Others)</div>
                      <div className="text-[10px] text-muted-foreground">World visitors</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={permissions.others.read}
                        onChange={(e) => updatePermission("others", "read", e.target.checked)}
                        disabled={busy}
                        aria-label="Others Read"
                        className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={permissions.others.write}
                        onChange={(e) => updatePermission("others", "write", e.target.checked)}
                        disabled={busy}
                        aria-label="Others Write"
                        className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={permissions.others.execute}
                        onChange={(e) => updatePermission("others", "execute", e.target.checked)}
                        disabled={busy}
                        aria-label="Others Execute"
                        className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Real-time Octal & Symbolic Display */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="octal-input">Octal Notation</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    id="octal-input"
                    value={modeInput}
                    onChange={(e) => handleModeInputChange(e.target.value)}
                    maxLength={4}
                    placeholder="0755"
                    disabled={busy}
                    className="font-mono text-base font-semibold"
                  />
                </div>
              </div>
              <div>
                <Label>Symbolic Notation</Label>
                <div className="mt-1 flex h-9 items-center rounded-lg border border-border bg-muted/30 px-3 font-mono text-xs font-semibold text-foreground">
                  {symbolic}
                </div>
              </div>
            </div>

            {isFullAccess ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                <ShieldAlert size={16} className="shrink-0 text-amber-400" />
                <span>
                  <strong>Caution:</strong> 0777 grants write access to everyone on the system and is
                  a security risk.
                </span>
              </div>
            ) : null}

            {/* Quick Presets */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Standard Presets:</p>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("0644")}
                  className={modeInput.endsWith("644") ? "border-brand bg-brand/10 text-brand" : ""}
                >
                  0644 (Standard File)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("0755")}
                  className={modeInput.endsWith("755") ? "border-brand bg-brand/10 text-brand" : ""}
                >
                  0755 (Directory / Executable)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("0600")}
                  className={modeInput.endsWith("600") ? "border-brand bg-brand/10 text-brand" : ""}
                >
                  0600 (Private File)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("0444")}
                  className={modeInput.endsWith("444") ? "border-brand bg-brand/10 text-brand" : ""}
                >
                  0444 (Read-only)
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={busy}>
                <ShieldCheck size={14} aria-hidden="true" />
                Apply Permissions
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
