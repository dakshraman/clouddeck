"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Shield,
  Cpu,
  Layers,
  Server,
  Archive,
  Database,
  Mail,
  Terminal,
  Lock,
  Globe,
  HardDrive,
  Key,
  FileCode,
  Zap,
  Bot,
  Stethoscope,
  Clock,
  Sliders,
  MessageSquare,
  Sparkles,
  CheckCircle,
} from "lucide-react";

export function BentoGrid() {
  const [activeCategory, setActiveCategory] = useState<"features" | "hosting" | "security">("features");

  return (
    <section id="architecture" className="py-16 sm:py-24 relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#74B8CC]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Built for Everyone</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F4F8FA] sm:text-4xl">
            Powerful features. Zero unnecessary complexity.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-[#8FA6B5]">
            Whether you are launching your first WordPress blog, managing client websites, or running production web apps, CloudDeck handles the heavy lifting.
          </p>
        </div>

        {/* Category Segmented Switcher */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex flex-wrap justify-center rounded-xl border border-white/10 bg-[#0D131A] p-1.5 shadow-subtle gap-1">
            <button
              type="button"
              onClick={() => setActiveCategory("features")}
              className={`rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
                activeCategory === "features"
                  ? "bg-[#18232F] text-[#F4F8FA] shadow-sm border border-white/10 font-semibold text-[#74B8CC]"
                  : "text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              Essential Highlights
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("hosting")}
              className={`rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
                activeCategory === "hosting"
                  ? "bg-[#18232F] text-[#F4F8FA] shadow-sm border border-white/10 font-semibold text-[#74B8CC]"
                  : "text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              Websites &amp; Databases
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("security")}
              className={`rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
                activeCategory === "security"
                  ? "bg-[#18232F] text-[#F4F8FA] shadow-sm border border-white/10 font-semibold text-[#74B8CC]"
                  : "text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              Security &amp; Peace of Mind
            </button>
          </div>
        </div>

        {/* Dynamic Bento Cards */}
        <div className="mt-10">
          <AnimatePresence mode="wait">
            {activeCategory === "features" && (
              <motion.div
                key="features"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {/* Card 1: Easy WordPress & Apps */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#74B8CC]/10 border border-[#74B8CC]/20 text-[#74B8CC]">
                      <Globe className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      1-Click Website Creation
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      Add a custom domain, choose WordPress, PHP, or Node.js, and your site is ready in seconds with automatic HTTPS padlocks.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#10B981] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>Automatic SSL Included</span>
                  </div>
                </motion.div>

                {/* Card 2: Lightweight Speed */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981]">
                      <Cpu className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      Runs on Cheap $4/mo Cloud VPS
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      Unlike old, bulky panels that consume 1.5GB of RAM just doing nothing, CloudDeck uses under 50MB. Save money on server hardware.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#74B8CC] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>Ultra-efficient engine</span>
                  </div>
                </motion.div>

                {/* Card 3: Free & Open Source */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FAAA93]/10 border border-[#FAAA93]/20 text-[#FAAA93]">
                      <Zap className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      100% Free Forever
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      No surprise invoices, artificial limits, or expensive monthly licenses. Everything is open source with full feature access out of the box.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#FAAA93] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>MIT Licensed</span>
                  </div>
                </motion.div>

                {/* Card 4: Site Doctor */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#74B8CC]/10 border border-[#74B8CC]/20 text-[#74B8CC]">
                      <Stethoscope className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      Automated Site Doctor
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      If something ever goes wrong, run the Site Doctor. It diagnoses configuration problems and fixes them for you in one single click.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#10B981] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>1-Click Self Healing</span>
                  </div>
                </motion.div>

                {/* Card 5: Local Computer Suite */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6494AC]/10 border border-[#6494AC]/20 text-[#6494AC]">
                      <Server className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      Works on Mac &amp; Windows Too
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      Replace clunky tools like XAMPP or MAMP. Run CloudDeck on your laptop or workstation for local development with genuine Nginx speed.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#74B8CC] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>Mac, Windows WSL 2 &amp; Linux</span>
                  </div>
                </motion.div>

                {/* Card 6: Visual File Browser */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#74B8CC]/10 border border-[#74B8CC]/20 text-[#74B8CC]">
                      <FileCode className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      In-Browser File Manager
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      Upload files, edit code directly in your browser, extract ZIP archives, and manage folders without needing separate FTP software.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#10B981] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>Built-in Code Editor</span>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {activeCategory === "hosting" && (
              <motion.div
                key="hosting"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {/* Multi-PHP */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#74B8CC]/10 border border-[#74B8CC]/20 text-[#74B8CC]">
                      <Zap className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      Seamless Multi-PHP Support
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      Run legacy PHP 8.1 sites right alongside modern PHP 8.4 apps on the exact same server. Switch versions per website with zero friction.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#10B981] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>PHP 8.1, 8.2, 8.3 &amp; 8.4</span>
                  </div>
                </motion.div>

                {/* Databases */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FAAA93]/10 border border-[#FAAA93]/20 text-[#FAAA93]">
                      <Database className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      MariaDB &amp; PostgreSQL Databases
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      Create databases and users in 1 click. Access phpMyAdmin directly with single sign-on or download instant compressed backup dumps.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#74B8CC] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>1-Click phpMyAdmin Login</span>
                  </div>
                </motion.div>

                {/* Professional Email */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981]">
                      <Mail className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      Custom Domain Email
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      Send and receive emails with your own domain name (e.g. hello@yourbrand.com). Includes automatic DKIM &amp; SPF for high deliverability.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#10B981] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>Spam Protection &amp; DKIM</span>
                  </div>
                </motion.div>

                {/* Visual Scheduled Tasks */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#74B8CC]/10 border border-[#74B8CC]/20 text-[#74B8CC]">
                      <Clock className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      Visual Scheduled Tasks (Cron)
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      Run automated tasks easily with human-friendly presets like &quot;Every hour&quot; or &quot;Daily at midnight&quot; and test them anytime with one click.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#74B8CC] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>Preset timers &amp; Run-Now testing</span>
                  </div>
                </motion.div>

                {/* App Store Stacks */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FAAA93]/10 border border-[#FAAA93]/20 text-[#FAAA93]">
                      <Layers className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      1-Click Docker Applications
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      Expand your capabilities with community apps like Redis caching, Ghost newsletter publishing, and MinIO storage without config headaches.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#FAAA93] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>Automated reverse proxy</span>
                  </div>
                </motion.div>

                {/* Node & Modern Apps */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#74B8CC]/10 border border-[#74B8CC]/20 text-[#74B8CC]">
                      <Server className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      Next.js &amp; Node.js Hosting
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      Not just for PHP: deploy Next.js apps, Express APIs, and Python services with automatic process supervision and restart reliability.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#10B981] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>Always-on auto restart</span>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {activeCategory === "security" && (
              <motion.div
                key="security"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {/* Zero-Root Safety */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981]">
                      <Shield className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      Zero-Root Web Safety
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      Your website panel runs safely as an unprivileged user. Even if an attacker finds a web bug, they cannot access root server permissions.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#10B981] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>Sandboxed Execution</span>
                  </div>
                </motion.div>

                {/* Firewall & Brute-Force Block */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#74B8CC]/10 border border-[#74B8CC]/20 text-[#74B8CC]">
                      <Lock className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      Automatic Firewall &amp; Anti-Brute Force
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      Integrated Fail2ban automatically blocks malicious bots and hackers trying to guess passwords. Easily unban IPs directly from the dashboard.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#74B8CC] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>Automated IP Banning</span>
                  </div>
                </motion.div>

                {/* 2-Factor Authentication */}
                <motion.div whileHover={{ y: -4 }} className="deck-card p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FAAA93]/10 border border-[#FAAA93]/20 text-[#FAAA93]">
                      <Key className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      Two-Factor Authentication (2FA)
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                      Secure your dashboard login using standard Authenticator apps (Google Authenticator, Apple Keychain, 1Password) with 8 backup recovery codes.
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs text-[#FAAA93] font-medium">
                    <CheckCircle className="h-4 w-4" />
                    <span>Standard TOTP + Recovery Keys</span>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
