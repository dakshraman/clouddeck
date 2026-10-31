(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- header scroll & active nav ---------- */

  const header = document.querySelector("[data-header]");
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Section observer for active nav highlighting
  const navLinks = Array.from(document.querySelectorAll(".primary-nav a, .mobile-menu a"));
  const sectionIds = ["top", "comparison", "features", "applications", "security", "install", "docs"];
  const sections = sectionIds
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length > 0) {
    const navObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const currentId = entry.target.id;
            navLinks.forEach((link) => {
              const href = link.getAttribute("href");
              const isActive = href === `#${currentId}`;
              link.classList.toggle("is-active", isActive);
              if (isActive) {
                link.setAttribute("aria-current", "page");
              } else if (link.getAttribute("aria-current") === "page") {
                link.removeAttribute("aria-current");
              }
            });
          }
        });
      },
      { threshold: 0.25, rootMargin: "-10% 0px -50% 0px" },
    );
    sections.forEach((sec) => navObserver.observe(sec));
  }

  /* ---------- mobile menu ---------- */

  const menuToggle = document.querySelector("[data-menu-toggle]");
  const mobileMenu = document.querySelector("[data-mobile-menu]");
  const menuIcon = menuToggle?.querySelector("use");

  const setMenu = (open) => {
    if (!menuToggle || !mobileMenu) return;
    mobileMenu.hidden = !open;
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (menuIcon) menuIcon.setAttribute("href", open ? "#i-close" : "#i-menu");
    document.body.style.overflow = open ? "hidden" : "";
  };

  menuToggle?.addEventListener("click", () => {
    setMenu(menuToggle.getAttribute("aria-expanded") !== "true");
  });

  mobileMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenu(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) setMenu(false);
  });

  /* ---------- scroll reveal ---------- */

  const revealItems = Array.from(document.querySelectorAll(".reveal"));

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );

    revealItems.forEach((item) => observer.observe(item));
  }

  /* ---------- copy buttons with animated feedback ---------- */

  const cleanCommand = (text) =>
    text
      .split("\n")
      .map((line) => line.replace(/^\s*\$\s?/, "").replace(/\s+$/, ""))
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n")
      .trim();

  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  };

  document.querySelectorAll("[data-copy-target], [data-copy-text]").forEach((button) => {
    button.addEventListener("click", async () => {
      let text = button.getAttribute("data-copy-text") || "";
      if (!text) {
        const targetId = button.getAttribute("data-copy-target");
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target) return;
        text = cleanCommand(target.textContent || "");
      }
      if (!text) return;

      const tooltip = button.querySelector(".copy-tooltip");
      const originalTooltipText = tooltip ? tooltip.textContent : "";
      const originalLabel = button.getAttribute("aria-label");

      try {
        await copyText(text);
        button.classList.add("is-copied");
        button.setAttribute("aria-label", "Copied to clipboard");
        if (tooltip) tooltip.textContent = "Copied to clipboard!";

        window.setTimeout(() => {
          button.classList.remove("is-copied");
          if (originalLabel) button.setAttribute("aria-label", originalLabel);
          if (tooltip && originalTooltipText) tooltip.textContent = originalTooltipText;
        }, 2200);
      } catch {
        button.setAttribute("aria-label", "Copy failed");
        if (tooltip) tooltip.textContent = "Failed to copy";
        window.setTimeout(() => {
          if (originalLabel) button.setAttribute("aria-label", originalLabel);
          if (tooltip && originalTooltipText) tooltip.textContent = originalTooltipText;
        }, 2000);
      }
    });
  });

  /* ---------- interactive hero preview tabs ---------- */

  const previewTabs = Array.from(document.querySelectorAll("[data-preview-tab]"));
  const previewViews = Array.from(document.querySelectorAll("[data-preview-view]"));
  const sidebarNavItems = Array.from(document.querySelectorAll("[data-preview-nav]"));

  const activatePreviewTab = (id, focus = false) => {
    previewTabs.forEach((tab) => {
      const match = tab.getAttribute("data-preview-tab") === id;
      tab.classList.toggle("is-active", match);
      tab.setAttribute("aria-selected", String(match));
      tab.tabIndex = match ? 0 : -1;
      if (match && focus) tab.focus();
    });

    previewViews.forEach((view) => {
      const match = view.getAttribute("data-preview-view") === id;
      view.hidden = !match;
      view.classList.toggle("is-active", match);
    });

    // Also sync the visual active item in the dashboard sidebar
    sidebarNavItems.forEach((navItem) => {
      const match = navItem.getAttribute("data-preview-nav") === id;
      navItem.classList.toggle("active", match);
    });
  };

  previewTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      const targetId = tab.getAttribute("data-preview-tab");
      if (targetId) activatePreviewTab(targetId);
    });

    tab.addEventListener("keydown", (event) => {
      const last = previewTabs.length - 1;
      let next = index;

      if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
      else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = last;
      else return;

      event.preventDefault();
      const target = previewTabs[next];
      const targetId = target.getAttribute("data-preview-tab");
      if (targetId) activatePreviewTab(targetId, true);
    });
  });

  // Allow clicking on sidebar items to switch view too
  sidebarNavItems.forEach((navItem) => {
    navItem.style.cursor = "pointer";
    navItem.addEventListener("click", () => {
      const targetId = navItem.getAttribute("data-preview-nav");
      if (targetId) activatePreviewTab(targetId);
    });
  });

  /* ---------- install tabs (Linux VPS vs Source) ---------- */

  const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
  const tabPanels = Array.from(document.querySelectorAll("[data-panel]"));

  const activateTab = (id, focus = false) => {
    tabButtons.forEach((button) => {
      const active = button.getAttribute("data-tab") === id;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    });

    tabPanels.forEach((panel) => {
      const active = panel.getAttribute("data-panel") === id;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
  };

  tabButtons.forEach((button, index) => {
    button.addEventListener("click", () => activateTab(button.getAttribute("data-tab") || "linux"));

    button.addEventListener("keydown", (event) => {
      const last = tabButtons.length - 1;
      let next = index;

      if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
      else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = last;
      else return;

      event.preventDefault();
      const target = tabButtons[next];
      activateTab(target.getAttribute("data-tab") || "linux", true);
    });
  });

  /* ---------- hero platform pill auto-tab switch ---------- */

  document.querySelectorAll(".hero-uni-pills [data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      if (tabId) activateTab(tabId);
    });
  });

  /* ---------- under the hood pill switcher ---------- */

  const hoodPills = Array.from(document.querySelectorAll(".hood-pill"));
  const hoodGrids = Array.from(document.querySelectorAll("[data-hood-grid]"));
  hoodPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const cat = pill.getAttribute("data-hood-cat");
      hoodPills.forEach((p) => {
        const isMatch = p === pill;
        p.classList.toggle("is-active", isMatch);
        p.setAttribute("aria-selected", String(isMatch));
      });
      if (cat) {
        hoodGrids.forEach((grid) => {
          const isGridMatch = grid.getAttribute("data-hood-grid") === cat;
          grid.hidden = !isGridMatch;
          grid.classList.toggle("is-active", isGridMatch);
        });
      }
    });
  });

  /* ---------- interactive FAQ accordion ---------- */

  const faqItems = Array.from(document.querySelectorAll(".faq-list details, .faq-accordion details, .faq-item"));
  faqItems.forEach((details) => {
    details.addEventListener("toggle", () => {
      if (details.open) {
        details.classList.add("is-open");
      } else {
        details.classList.remove("is-open");
      }
    });
  });

  /* ---------- year ---------- */

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
})();
