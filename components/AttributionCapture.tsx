"use client";

import { useEffect } from "react";

// First-touch attribution: on the first visit that carries a ref code or UTM
// params, stash them in a 30-day cookie. The onboarding wizard persists the
// cookie onto the company record after signup. No third-party analytics.
export default function AttributionCapture() {
  useEffect(() => {
    try {
      if (document.cookie.includes("reknock_attrib=")) return;
      const q = new URLSearchParams(window.location.search);
      const data: Record<string, string> = {};
      for (const k of ["ref", "utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
        const v = q.get(k);
        if (v) data[k] = v.slice(0, 120);
      }
      if (document.referrer && !document.referrer.includes(window.location.hostname)) {
        data.referrer = document.referrer.slice(0, 300);
      }
      if (Object.keys(data).length === 0) return;
      data.landing = window.location.pathname;
      data.ts = new Date().toISOString();
      const expires = new Date(Date.now() + 30 * 86400_000).toUTCString();
      document.cookie = `reknock_attrib=${encodeURIComponent(JSON.stringify(data))}; expires=${expires}; path=/; SameSite=Lax`;
    } catch {
      /* attribution is never worth breaking a page over */
    }
  }, []);
  return null;
}
