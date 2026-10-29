import { config } from "@/lib/config";

export function agentHeaders(contentType?: string): Headers {
  const headers = new Headers();
  if (contentType) headers.set("Content-Type", contentType);
  if (config.agentToken) headers.set("X-CloudDeck-Agent-Token", config.agentToken);
  return headers;
}
