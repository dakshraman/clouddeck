"use client";

import { useCallback, useEffect, useState } from "react";
import type { MaskedVaultKey, VaultKeysResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { CheckCircle2, Eye, EyeOff, KeyRound, Lock, RefreshCw, Save } from "lucide-react";

interface KeyMeta {
  label: string;
  placeholder: string;
  description: string;
}

const KEY_METAS: Record<string, KeyMeta> = {
  ANTHROPIC_API_KEY: {
    label: "Anthropic API Key",
    placeholder: "sk-ant-api03-...",
    description: "Powers Claude Code, Aider, and the CloudDeck AI assistant.",
  },
  OPENAI_API_KEY: {
    label: "OpenAI API Key",
    placeholder: "sk-proj-...",
    description: "Powers OpenAI Codex, Aider, Goose, and GPT models.",
  },
  GEMINI_API_KEY: {
    label: "Google Gemini API Key",
    placeholder: "AIzaSy...",
    description: "Powers Google Antigravity and Gemini 2.0 Flash / Pro models.",
  },
  DEEPSEEK_API_KEY: {
    label: "DeepSeek API Key",
    placeholder: "sk-...",
    description: "Powers DeepSeek-V3 and DeepSeek-Coder high-performance reasoning.",
  },
  OLLAMA_HOST: {
    label: "Ollama Daemon URL",
    placeholder: "http://127.0.0.1:11434",
    description: "Local open-weight model runner endpoint with zero API costs.",
  },
  GROQ_API_KEY: {
    label: "Groq Cloud API Key",
    placeholder: "gsk_...",
    description: "Ultra-fast LPU inference for Llama 3 and open models.",
  },
};

export function ApiKeyVaultCard() {
  const [keys, setKeys] = useState<MaskedVaultKey[]>([]);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<VaultKeysResponse>("/api/agents/keys");
      setKeys(res.keys || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load keys from vault.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    // Filter out empty or whitespace only strings
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(draftValues)) {
      if (v.trim()) {
        payload[k] = v.trim();
      }
    }

    try {
      await apiPost("/api/agents/keys", payload);
      setNotice("API credentials safely updated in server vault!");
      setDraftValues({});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API keys.");
    } finally {
      setSaving(false);
    }
  };

  const toggleShow = (name: string) => {
    setShowSecret((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleInputChange = (name: string, val: string) => {
    setDraftValues((prev) => ({ ...prev, [name]: val }));
  };

  const configuredCount = keys.filter((k) => k.isSet).length;

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-muted/60 text-foreground">
            <Lock size={18} aria-hidden="true" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">AI Provider Key Vault</CardTitle>
              <Badge variant="neutral" className="text-[11px]">
                {configuredCount} configured
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Securely store credentials for Anthropic, OpenAI, Gemini, DeepSeek, and local Ollama daemon.
            </CardDescription>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void load()}
          disabled={loading || saving}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : undefined} aria-hidden="true" />
          Refresh
        </Button>
      </CardHeader>

      <CardBody>
        {notice ? (
          <Alert variant="success" className="mb-4">
            {notice}
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        ) : null}

        <form onSubmit={handleSave} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            {keys.map((k) => {
              const meta = KEY_METAS[k.name] || {
                label: k.name,
                placeholder: "Enter secret key...",
                description: "Provider API credential.",
              };
              const isVisible = Boolean(showSecret[k.name]);
              const currentDraft = draftValues[k.name] ?? "";

              return (
                <div
                  key={k.name}
                  className="rounded-lg border border-border/70 bg-muted/20 p-3.5 transition-colors hover:border-border"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor={`key-${k.name}`}
                      className="text-xs font-semibold text-foreground flex items-center gap-1.5"
                    >
                      <KeyRound size={12} className="text-muted-foreground" aria-hidden="true" />
                      {meta.label}
                    </label>

                    {k.isSet ? (
                      <Badge variant="green" className="text-[10px] py-0 px-1.5 flex items-center gap-1">
                        <CheckCircle2 size={10} aria-hidden="true" />
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="neutral" className="text-[10px] py-0 px-1.5">
                        Not Set
                      </Badge>
                    )}
                  </div>

                  <p className="mb-2 text-[11px] text-muted-foreground line-clamp-1">{meta.description}</p>

                  <div className="relative flex items-center">
                    <input
                      id={`key-${k.name}`}
                      type={isVisible ? "text" : "password"}
                      value={currentDraft}
                      placeholder={k.isSet ? k.maskedVal : meta.placeholder}
                      onChange={(e) => handleInputChange(k.name, e.target.value)}
                      className="h-8.5 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring font-mono pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShow(k.name)}
                      className="absolute right-2 text-muted-foreground hover:text-foreground"
                      title={isVisible ? "Hide secret" : "Show secret"}
                    >
                      {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={saving}
              disabled={loading || Object.keys(draftValues).length === 0}
            >
              <Save size={14} aria-hidden="true" />
              Save Vault Credentials
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
