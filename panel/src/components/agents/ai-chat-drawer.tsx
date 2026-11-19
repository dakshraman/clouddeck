"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatResponse } from "@/lib/types";
import { apiPost } from "@/components/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Bot,
  Cpu,
  HelpCircle,
  MessageSquare,
  RotateCcw,
  Send,
  Server,
  ShieldAlert,
  Sparkles,
  Terminal,
  User,
  Wand2,
  X,
} from "lucide-react";

const SUGGESTED_PROMPTS = [
  { label: "Diagnose 502 Bad Gateway", icon: ShieldAlert },
  { label: "Check CPU & Memory spikes", icon: Cpu },
  { label: "Help me configure Nginx vhost", icon: Server },
  { label: "How do I install DeepSeek with Ollama?", icon: Terminal },
];

export function AiChatDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello! I am your CloudDeck AI Assistant. I have live visibility into server health, hosted sites, runtimes, and background tasks. How can I assist you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeModel, setActiveModel] = useState<string>("clouddeck-assistant");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const prompt = (textToSend ?? input).trim();
    if (!prompt || loading) return;

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: prompt }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await apiPost<ChatResponse>("/api/agents/chat", {
        prompt,
        history: messages.slice(-10), // Send last 10 turns
      });

      if (res?.reply) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.reply },
        ]);
        if (res.model) {
          setActiveModel(res.model);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "No response received from AI model." },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Failed to communicate with AI chat engine."}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleReset = () => {
    setMessages([
      {
        role: "assistant",
        content: "Conversation cleared. How can I help you manage your server or sites?",
      },
    ]);
  };

  return (
    <>
      {/* Floating Launcher Button */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-2 rounded-full border border-primary/30 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label="Open AI Assistant"
        >
          <Sparkles size={16} className="animate-pulse" aria-hidden="true" />
          <span>AI Assistant</span>
          <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
        </button>
      </div>

      {/* Slide-out Drawer */}
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
          <div
            className="flex h-full w-full max-w-lg flex-col bg-card shadow-2xl border-l border-border animate-in slide-in-from-right duration-300"
            role="dialog"
            aria-modal="true"
            aria-label="AI Assistant Chat"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bot size={18} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    CloudDeck AI Assistant
                    <Badge variant="neutral" className="text-[10px] font-mono py-0">
                      {activeModel}
                    </Badge>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">Context-aware autonomous host diagnostics</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  title="Clear conversation"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  title="Close drawer"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                >
                  <X size={16} aria-hidden="true" />
                </Button>
              </div>
            </div>

            {/* Context Notice */}
            <div className="bg-muted/40 border-b border-border/70 px-4 py-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Server size={12} className="text-primary shrink-0" aria-hidden="true" />
              <span>Real-time server telemetry and site status attached to every inquiry.</span>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                        isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground border border-border"
                      }`}
                    >
                      {isUser ? <User size={13} /> : <Bot size={13} />}
                    </span>

                    <div
                      className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                        isUser
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/60 text-foreground border border-border/60"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })}

              {loading ? (
                <div className="flex items-start gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground border border-border">
                    <Bot size={13} />
                  </span>
                  <div className="flex items-center gap-2 rounded-xl bg-muted/60 border border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
                    <Spinner size={12} />
                    <span>Analyzing system telemetry & generating response...</span>
                  </div>
                </div>
              ) : null}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestion Chips */}
            {messages.length <= 2 ? (
              <div className="border-t border-border/50 bg-muted/10 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Wand2 size={11} aria-hidden="true" />
                  Suggested Inquiries
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_PROMPTS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => void handleSend(p.label)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <Icon size={11} aria-hidden="true" />
                        <span>{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Drawer Footer & Input */}
            <div className="border-t border-border p-4 bg-card">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSend();
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about this server, sites, or error logs..."
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!input.trim() || loading}
                  className="h-9 px-3 shrink-0"
                >
                  <Send size={14} aria-hidden="true" />
                </Button>
              </form>
              <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
                Press Enter to send, Shift+Enter for newline
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
