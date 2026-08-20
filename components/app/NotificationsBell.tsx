"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getNotifications, type Notification } from "@/lib/notifications";

const SEEN_KEY = "reknock_notifs_seen_at";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const ICON: Record<Notification["kind"], string> = { reply: "💬", cap: "⬆️", opt_out: "🚫", usage: "◷" };

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [seenAt, setSeenAt] = useState<string>("");

  useEffect(() => {
    setSeenAt(localStorage.getItem(SEEN_KEY) ?? "");
    getNotifications().then(setItems).catch(() => {});
  }, []);

  const newest = items[0]?.at ?? "";
  const hasUnread = Boolean(newest) && newest > seenAt;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && newest) {
      localStorage.setItem(SEEN_KEY, newest);
      setSeenAt(newest);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-slate transition-colors hover:bg-sky hover:text-blue"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {hasUnread ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" /> : null}
      </button>

      {open ? (
        <>
          <button type="button" aria-label="Close notifications" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="overlay-panel absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-sky-line bg-white p-1.5 shadow-overlay">
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-mist">Notifications</p>
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-mist">You are all caught up.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {items.map((n) => {
                  const inner = (
                    <div className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 hover:bg-sky">
                      <span aria-hidden className="text-base leading-none">{ICON[n.kind]}</span>
                      <div className="min-w-0">
                        <p className="text-sm text-ink">{n.text}</p>
                        <p className="mt-0.5 text-xs text-mist">{timeAgo(n.at)}</p>
                      </div>
                    </div>
                  );
                  return n.href ? (
                    <Link key={n.id} href={n.href} onClick={() => setOpen(false)} className="block">{inner}</Link>
                  ) : (
                    <div key={n.id}>{inner}</div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
