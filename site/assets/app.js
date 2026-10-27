(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- header ---------- */

  const header = document.querySelector("[data-header]");
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

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

  /* ---------- copy buttons ---------- */

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

  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const targetId = button.getAttribute("data-copy-target");
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;

      const text = cleanCommand(target.textContent || "");
      if (!text) return;

      const originalLabel = button.getAttribute("aria-label");
      try {
        await copyText(text);
        button.classList.add("is-copied");
        button.setAttribute("aria-label", "Copied");
        window.setTimeout(() => {
          button.classList.remove("is-copied");
          if (originalLabel) button.setAttribute("aria-label", originalLabel);
        }, 1800);
      } catch {
        button.setAttribute("aria-label", "Copy failed");
      }
    });
  });

  /* ---------- install tabs ---------- */

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

  /* ---------- year ---------- */

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
})();
