import type { ApiErrorBody, Task } from "@/lib/types";

export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    const message = body?.error?.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    // Non-JSON error body.
  }
  if (res.status === 401) return "Your session has expired. Please sign in again.";
  if (res.status >= 500) return "The panel could not reach the CloudDeck agent.";
  return `Request failed (HTTP ${res.status}).`;
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { cache: "no-store", ...init });
  if (!res.ok) {
    throw new HttpError(await readError(res), res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiPost<T>(input: string, body: unknown): Promise<T> {
  return apiFetch<T>(input, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function waitForTask(taskId: string, signal?: AbortSignal, intervalMs = 1000): Promise<Task> {
  for (;;) {
    const task = await apiFetch<Task>(`/api/tasks/${encodeURIComponent(taskId)}`, { signal });
    if (task.status === "succeeded" || task.status === "failed") return task;
    await sleep(intervalMs, signal);
  }
}
