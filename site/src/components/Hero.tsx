"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Copy,
  Check,
  Server,
  ArrowRight,
  Shield,
  Activity,
  Globe,
  Database,
  Cpu,
  ExternalLink,
  Sparkles,
  MousePointerClick,
  Zap,
  CheckCircle2,
  Lock,
  Terminal,
} from "lucide-react";

export function Hero() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "sites" | "services" | "terminal">("overview");
  const [liveReqCount, setLiveReqCount] = useState(2580);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Idle metric tick animation simulating live healthy traffic
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveReqCount((prev) => prev + Math.floor(Math.random() * 5) + 1);
    }, 2400);
    return () => clearInterval(timer);
  }, []);

  const installCommand = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <section id="top" className="relative pt-8 pb-14 sm:pt-14 sm:pb-20 overflow-hidden">
      {/* Dynamic Background Idle Atmosphere */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <motion.div
          animate={{
            scale: [1, 1.08, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="h-[480px] w-[640px] rounded-full bg-gradient-to-tr from-[#74B8CC]/20 via-[#235361]/15 to-transparent blur-[120px]"
        />
        <motion.div
          animate={{
            scale: [1.05, 0.95, 1.05],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{
            duration: 11,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute right-1/4 top-1/4 h-[350px] w-[350px] rounded-full bg-[#FAAA93]/10 blur-[100px]"
        />
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Friendly Top Pill */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex justify-center"
        >
          <a
            href="#tour"
            className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-[#8FA6B5] hover:border-[#74B8CC]/40 hover:text-[#F4F8FA] hover:bg-white/10 transition-all shadow-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]" />
            </span>
            <span className="font-semibold text-[#F4F8FA]">100% Free &amp; Open Source</span>
            <span className="text-white/20">•</span>
            <span className="text-[#8FA6B5] group-hover:text-[#F4F8FA] transition-colors">
              Self-host your websites &amp; apps effortlessly
            </span>
            <ArrowRight className="h-3 w-3 text-[#74B8CC] transition-transform group-hover:translate-x-0.5" />
          </a>
        </motion.div>

        {/* Hero Headline & Benefit-Driven Story */}
        <div className="mt-7 text-center max-w-3xl mx-auto">
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-3xl font-semibold tracking-tight text-[#F4F8FA] sm:text-5xl sm:leading-[1.15]"
          >
            Run all your websites &amp; apps <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-[#F4F8FA] via-[#74B8CC] to-[#FAAA93] bg-clip-text text-transparent">
              without server headaches.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-4 text-base sm:text-lg text-[#8FA6B5] leading-relaxed"
          >
            CloudDeck gives you a beautiful, blazing-fast dashboard to host WordPress, Node.js, PHP, databases, and Docker apps. Keep full control of your server while saving hundreds in hosting fees every month.
          </motion.p>
        </div>

        {/* Interactive Benefit Chips */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm text-[#8FA6B5]"
        >
          <div className="flex items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1 border border-white/5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />
            <span>1-Click App Installs</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1 border border-white/5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />
            <span>Automatic Free SSL</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1 border border-white/5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />
            <span>Zero Server Slowdown</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1 border border-white/5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />
            <span>Works on $4/mo VPS</span>
          </div>
        </motion.div>

        {/* Primary Interactive Actions */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-7 flex flex-wrap items-center justify-center gap-3.5"
        >
          <motion.a
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            href="#install"
            className="flex items-center gap-2 rounded-xl bg-[#74B8CC] px-6 py-3 text-xs sm:text-sm font-semibold text-[#080C10] hover:bg-[#8fd2e5] transition-all shadow-lg shadow-[#74B8CC]/15"
          >
            <Sparkles className="h-4 w-4" />
            <span>Start Free in 2 Minutes</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </motion.a>

          <motion.a
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            href="#tour"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-xs sm:text-sm font-medium text-[#F4F8FA] hover:bg-white/10 hover:border-white/20 transition-all"
          >
            <MousePointerClick className="h-3.5 w-3.5 text-[#74B8CC]" />
            <span>Explore Live Demo Tour</span>
          </motion.a>
        </motion.div>

        {/* 1-Click Interactive Copy Command Bar */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="mt-5 flex justify-center"
        >
          <motion.div
            whileHover={{ borderColor: "rgba(116, 184, 204, 0.4)" }}
            className="flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0D131A] px-4 py-2.5 shadow-subtle sm:px-5 transition-colors"
          >
            <div className="flex items-center gap-2.5 overflow-hidden font-mono text-xs sm:text-sm">
              <span className="text-[#74B8CC] select-none font-bold">$</span>
              <span className="truncate text-[#F4F8FA]">{installCommand}</span>
            </div>

            <motion.button
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={handleCopy}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                copied
                  ? "border-[#10B981]/50 bg-[#10B981]/15 text-[#10B981]"
                  : "border-white/10 bg-white/5 text-[#8FA6B5] hover:bg-white/10 hover:text-[#F4F8FA]"
              }`}
              aria-label="Copy installation command"
            >
              <AnimatePresence mode="wait">
                {copied ? (
                  <motion.div
                    key="copied"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="flex items-center gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5 text-[#10B981]" />
                    <span>Copied!</span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="copy"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="flex items-center gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Authentic Interactive Deck Console with Live Feedback */}
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          onMouseMove={handleMouseMove}
          style={
            {
              "--mouse-x": `${mousePosition.x}px`,
              "--mouse-y": `${mousePosition.y}px`,
            } as React.CSSProperties
          }
          className="deck-card ambient-glow mt-10 rounded-2xl border border-white/10 bg-[#0D131A] shadow-2xl overflow-hidden"
        >
          {/* Deck Header Bar */}
          <div className="flex flex-wrap items-center justify-between border-b border-white/10 bg-[#080C10] px-4 py-2.5 sm:px-5 gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
              </div>
              <span className="text-white/20">|</span>
              <div className="flex items-center gap-2 text-xs font-mono text-[#8FA6B5]">
                <Server className="h-3.5 w-3.5 text-[#74B8CC]" />
                <span className="text-[#F4F8FA] font-medium">My Production Server</span>
                <span className="text-white/30 hidden sm:inline">(Ubuntu 24.04 LTS)</span>
              </div>
            </div>

            {/* User Friendly Security Status Badge */}
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="flex items-center gap-1 text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded-full border border-[#10B981]/20">
                <Lock className="h-3 w-3" />
                <span>Protected &amp; Encrypted</span>
              </span>
              <span className="text-white/20 hidden sm:inline">•</span>
              <span className="text-[#8FA6B5] hidden sm:inline">Zero Root Exposure</span>
            </div>
          </div>

          {/* Telemetry Metrics Bar with Live Animation */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-white/10 border-b border-white/10 bg-[#101720] text-xs">
            <motion.div whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }} className="p-3 sm:px-4">
              <div className="text-[11px] text-[#8FA6B5] font-mono">Server Memory Used</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold text-[#F4F8FA] tabular-nums">46.8 MB</span>
                <span className="text-[11px] font-mono text-[#10B981] bg-[#10B981]/10 px-1.5 py-0.2 rounded">Lightweight</span>
              </div>
            </motion.div>

            <motion.div whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }} className="p-3 sm:px-4">
              <div className="text-[11px] text-[#8FA6B5] font-mono">Live Requests Handled</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold text-[#F4F8FA] tabular-nums">
                  {liveReqCount.toLocaleString()}
                </span>
                <span className="text-[11px] font-mono text-[#74B8CC] flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#74B8CC] animate-ping" />
                  Streaming
                </span>
              </div>
            </motion.div>

            <motion.div whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }} className="p-3 sm:px-4">
              <div className="text-[11px] text-[#8FA6B5] font-mono">Hosted Websites</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold text-[#F4F8FA] tabular-nums">14 Active</span>
                <span className="text-[11px] font-mono text-[#FAAA93]">Zero Downtime</span>
              </div>
            </motion.div>

            <motion.div whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }} className="p-3 sm:px-4">
              <div className="text-[11px] text-[#8FA6B5] font-mono">Health Status</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold text-[#10B981] tabular-nums">100% Healthy</span>
                <span className="text-[11px] font-mono text-[#8FA6B5]">All Stacks Live</span>
              </div>
            </motion.div>
          </div>

          {/* Interactive Navigation Tabs */}
          <div className="flex border-b border-white/10 bg-[#090D12] px-4 gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-all ${
                activeTab === "overview"
                  ? "border-[#74B8CC] text-[#F4F8FA] bg-white/[0.03]"
                  : "border-transparent text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Activity className="h-3.5 w-3.5 text-[#74B8CC]" />
              <span>Dashboard Overview</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sites")}
              className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-all ${
                activeTab === "sites"
                  ? "border-[#74B8CC] text-[#F4F8FA] bg-white/[0.03]"
                  : "border-transparent text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Globe className="h-3.5 w-3.5 text-[#FAAA93]" />
              <span>Websites &amp; SSL (14)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("services")}
              className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-all ${
                activeTab === "services"
                  ? "border-[#74B8CC] text-[#F4F8FA] bg-white/[0.03]"
                  : "border-transparent text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Cpu className="h-3.5 w-3.5 text-[#10B981]" />
              <span>Services (Auto-Managed)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("terminal")}
              className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-all ${
                activeTab === "terminal"
                  ? "border-[#74B8CC] text-[#F4F8FA] bg-white/[0.03]"
                  : "border-transparent text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Terminal className="h-3.5 w-3.5 text-[#74B8CC]" />
              <span>1-Click CLI Console</span>
            </button>
          </div>

          {/* Tab Content Viewport with Motion Fade */}
          <div className="p-4 sm:p-5 min-h-[220px]">
            <AnimatePresence mode="wait">
              {activeTab === "overview" && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  {/* Services Status Card */}
                  <div className="rounded-xl border border-white/10 bg-[#080C10] p-4">
                    <div className="text-xs font-mono font-medium text-[#8FA6B5] mb-3 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5 text-[#10B981]" />
                        <span>Background Services Running Smoothly</span>
                      </span>
                      <span className="text-[11px] text-[#10B981] bg-[#10B981]/15 px-2 py-0.5 rounded-full">Automated</span>
                    </div>
                    <div className="space-y-2.5 text-xs font-mono">
                      <div className="flex items-center justify-between p-1.5 rounded hover:bg-white/[0.02]">
                        <span className="text-[#F4F8FA]">Nginx Web Traffic Engine</span>
                        <span className="text-[#10B981] flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                          Ready (FastCGI)
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded hover:bg-white/[0.02]">
                        <span className="text-[#F4F8FA]">PHP 8.4 &amp; 8.3 Stacks</span>
                        <span className="text-[#10B981] flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                          Dual coexistence
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded hover:bg-white/[0.02]">
                        <span className="text-[#F4F8FA]">MariaDB Database Engine</span>
                        <span className="text-[#10B981] flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                          Online &amp; Tuned
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded hover:bg-white/[0.02]">
                        <span className="text-[#F4F8FA]">PowerDNS Zone Server</span>
                        <span className="text-[#10B981] flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                          Authoritative
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Highlights Card */}
                  <div className="rounded-xl border border-white/10 bg-[#080C10] p-4 flex flex-col justify-between">
                    <div>
                      <div className="text-xs font-mono font-medium text-[#8FA6B5] mb-2.5 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5 text-[#74B8CC]" />
                          <span>Why Users Love CloudDeck</span>
                        </span>
                        <span className="text-[11px] text-[#74B8CC] bg-[#74B8CC]/15 px-2 py-0.5 rounded-full">Easy Setup</span>
                      </div>
                      <p className="text-xs text-[#8FA6B5] leading-relaxed">
                        Never worry about complex Linux configuration files again. Add domains, switch PHP versions, generate SSL padlocks, and run scheduled tasks with simple visual controls designed for anyone.
                      </p>
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="text-[#8FA6B5]">RAM Consumption: <span className="text-[#10B981] font-semibold">&lt; 50 MB</span></div>
                      <div className="text-[#8FA6B5]">License Cost: <span className="text-[#74B8CC] font-semibold">$0 forever</span></div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === "sites" && (
                <motion.div
                  key="sites"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2 text-xs font-mono"
                >
                  <div className="grid grid-cols-12 gap-2 pb-1.5 text-[11px] text-[#8FA6B5] border-b border-white/10 px-2 font-medium">
                    <div className="col-span-5 sm:col-span-4">Website Domain</div>
                    <div className="col-span-3 sm:col-span-3">App Runtime</div>
                    <div className="col-span-2 sm:col-span-3">SSL Security</div>
                    <div className="col-span-2 text-right">Status</div>
                  </div>

                  <motion.div whileHover={{ scale: 1.005 }} className="grid grid-cols-12 gap-2 py-2 px-2 rounded-lg bg-white/[0.01] hover:bg-white/[0.03] items-center border border-white/5 transition-all">
                    <div className="col-span-5 sm:col-span-4 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse" />
                      <span className="text-[#F4F8FA] font-medium truncate">my-company.com</span>
                    </div>
                    <div className="col-span-3 sm:col-span-3 text-[#74B8CC]">WordPress / PHP 8.4</div>
                    <div className="col-span-2 sm:col-span-3 text-[#10B981] flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Auto SSL
                    </div>
                    <div className="col-span-2 text-right text-[#10B981] font-medium">Active</div>
                  </motion.div>

                  <motion.div whileHover={{ scale: 1.005 }} className="grid grid-cols-12 gap-2 py-2 px-2 rounded-lg bg-white/[0.01] hover:bg-white/[0.03] items-center border border-white/5 transition-all">
                    <div className="col-span-5 sm:col-span-4 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse" />
                      <span className="text-[#F4F8FA] font-medium truncate">store.brand.io</span>
                    </div>
                    <div className="col-span-3 sm:col-span-3 text-[#FAAA93]">Next.js / Node 22</div>
                    <div className="col-span-2 sm:col-span-3 text-[#10B981] flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Wildcard SSL
                    </div>
                    <div className="col-span-2 text-right text-[#10B981] font-medium">Active</div>
                  </motion.div>

                  <motion.div whileHover={{ scale: 1.005 }} className="grid grid-cols-12 gap-2 py-2 px-2 rounded-lg bg-white/[0.01] hover:bg-white/[0.03] items-center border border-white/5 transition-all">
                    <div className="col-span-5 sm:col-span-4 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse" />
                      <span className="text-[#F4F8FA] font-medium truncate">docs.clientportal.net</span>
                    </div>
                    <div className="col-span-3 sm:col-span-3 text-[#74B8CC]">Static Landing Page</div>
                    <div className="col-span-2 sm:col-span-3 text-[#10B981] flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Auto SSL
                    </div>
                    <div className="col-span-2 text-right text-[#10B981] font-medium">Active</div>
                  </motion.div>
                </motion.div>
              )}

              {activeTab === "services" && (
                <motion.div
                  key="services"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono"
                >
                  <div className="rounded-xl border border-white/10 bg-[#080C10] p-3.5">
                    <div className="flex items-center justify-between text-[#8FA6B5] mb-1">
                      <span>Nginx Web Engine</span>
                      <span className="text-[#10B981]">Healthy</span>
                    </div>
                    <div className="text-sm font-semibold text-[#F4F8FA]">Zero Config Needed</div>
                    <div className="mt-2 text-[11px] text-[#8FA6B5]">Handles HTTPS, reverse proxy &amp; FastCGI routing out of the box.</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#080C10] p-3.5">
                    <div className="flex items-center justify-between text-[#8FA6B5] mb-1">
                      <span>Database Engine</span>
                      <span className="text-[#10B981]">Healthy</span>
                    </div>
                    <div className="text-sm font-semibold text-[#F4F8FA]">MariaDB / MySQL</div>
                    <div className="mt-2 text-[11px] text-[#8FA6B5]">One-click database creation, user permissions, and automatic backups.</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#080C10] p-3.5">
                    <div className="flex items-center justify-between text-[#8FA6B5] mb-1">
                      <span>Security &amp; Firewall</span>
                      <span className="text-[#10B981]">Protected</span>
                    </div>
                    <div className="text-sm font-semibold text-[#F4F8FA]">Active Defense</div>
                    <div className="mt-2 text-[11px] text-[#8FA6B5]">Fail2ban and OWASP WAF guard your server against malicious bot traffic.</div>
                  </div>
                </motion.div>
              )}

              {activeTab === "terminal" && (
                <motion.div
                  key="terminal"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-xl bg-[#080C10] p-3.5 font-mono text-xs text-[#8FA6B5] space-y-1.5 overflow-x-auto"
                >
                  <div className="text-[#74B8CC]">$ clouddeck status</div>
                  <div className="text-[#F4F8FA]">Host Server: Ready &amp; Connected</div>
                  <div>Memory Usage: 46.8 MB (Extremely efficient)</div>
                  <div>Websites Managed: 14 Live Sites</div>
                  <div>Automated SSL Certificates: All renewed</div>
                  <div className="text-[#10B981]">Status: Everything is running smoothly.</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
