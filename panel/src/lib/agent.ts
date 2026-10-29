import { config } from "@/lib/config";
import type {
  CreateSiteRequest,
  IssueSslRequest,
  KillProcessResponse,
  PhpVersionsResponse,
  ProcessListResponse,
  RebootResponse,
  Site,
  SiteListResponse,
  SystemInfo,
  Task,
  TaskListResponse,
  UpdateResponse,
} from "@/lib/types";

const REQUEST_TIMEOUT_MS = 8000;

export class AgentError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "AgentError";
    this.status = status;
    this.code = code;
  }
}

interface TaskCreated {
  taskId: string;
}

interface AgentFetchInit {
  method?: string;
  body?: unknown;
}

function toAgentError(status: number, payload: unknown): AgentError {
  const fallback = `CloudDeck agent request failed with status ${status}`;
  if (payload && typeof payload === "object" && "error" in payload) {
    const { error } = payload as { error?: unknown };
    if (error && typeof error === "object") {
      const { code, message } = error as { code?: unknown; message?: unknown };
      return new AgentError(
        status,
        typeof message === "string" && message.length > 0 ? message : fallback,
        typeof code === "string" && code.length > 0 ? code : undefined,
      );
    }
  }
  return new AgentError(status, fallback);
}

export async function agentFetch<T>(path: string, init?: AgentFetchInit): Promise<T> {
  const hasBody = init?.body !== undefined;

  let res: Response;
  try {
    res = await fetch(config.agentUrl + path, {
      method: init?.method ?? "GET",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(init?.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AgentError(502, "CloudDeck agent is unreachable");
  }

  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null; // non-JSON body; the status decides how it is reported
  }

  if (!res.ok) {
    throw toAgentError(res.status, payload);
  }
  if (payload === null) {
    throw new AgentError(502, "CloudDeck agent returned an invalid response");
  }
  return payload as T;
}

export function getSystem(): Promise<SystemInfo> {
  return agentFetch<SystemInfo>("/v1/system");
}

export function getProcesses(sort: "cpu" | "mem" = "cpu"): Promise<ProcessListResponse> {
  return agentFetch<ProcessListResponse>(`/v1/processes?sort=${sort}`);
}

export function killProcess(pid: number): Promise<KillProcessResponse> {
  return agentFetch<KillProcessResponse>(`/v1/processes/${pid}/kill`, { method: "POST" });
}

export function rebootServer(): Promise<RebootResponse> {
  return agentFetch<RebootResponse>("/v1/system/reboot", { method: "POST" });
}

export function startUpdate(version: string): Promise<UpdateResponse> {
  return agentFetch<UpdateResponse>("/v1/update", { method: "POST", body: { version } });
}

export function getPhpVersions(): Promise<PhpVersionsResponse> {
  return agentFetch<PhpVersionsResponse>("/v1/php/versions");
}

export function listSites(): Promise<SiteListResponse> {
  return agentFetch<SiteListResponse>("/v1/sites");
}

export function getSite(domain: string): Promise<Site> {
  return agentFetch<Site>(`/v1/sites/${encodeURIComponent(domain)}`);
}

export function createSite(body: CreateSiteRequest): Promise<TaskCreated> {
  return agentFetch<TaskCreated>("/v1/sites", { method: "POST", body });
}

export function deleteSite(domain: string): Promise<TaskCreated> {
  return agentFetch<TaskCreated>(`/v1/sites/${encodeURIComponent(domain)}`, { method: "DELETE" });
}

export function issueSsl(domain: string, body: IssueSslRequest): Promise<TaskCreated> {
  return agentFetch<TaskCreated>(`/v1/sites/${encodeURIComponent(domain)}/ssl`, {
    method: "POST",
    body,
  });
}

export function listTasks(): Promise<TaskListResponse> {
  return agentFetch<TaskListResponse>("/v1/tasks");
}

export function getTask(id: string): Promise<Task> {
  return agentFetch<Task>(`/v1/tasks/${encodeURIComponent(id)}`);
}
