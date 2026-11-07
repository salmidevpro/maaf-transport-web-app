"use client";

import { useEffect } from "react";

const idleTimeoutMs = 15 * 60 * 1000;
const heartbeatIntervalMs = 60 * 1000;

export function SessionActivity({ role, returnPath }: { role: "admin" | "agent"; returnPath?: string }) {
  useEffect(() => {
    let lastActivity = Date.now();
    let lastHeartbeat = 0;
    let redirecting = false;
    const destination = () => {
      const login = role === "admin" ? "/admin/login" : "/agent/login";
      const params = new URLSearchParams({ expired: "1" });
      if (role === "agent" && returnPath) params.set("next", returnPath);
      return `${login}?${params.toString()}`;
    };
    const expire = async () => {
      if (redirecting) return;
      redirecting = true;
      try { await fetch("/api/auth/logout", { method: "POST", keepalive: true }); } catch { /* Continue to sign-in if the network is unavailable. */ }
      window.location.assign(destination());
    };
    const markActivity = () => { lastActivity = Date.now(); };
    const checkSession = async () => {
      if (Date.now() - lastActivity >= idleTimeoutMs) {
        await expire();
        return;
      }
      if (Date.now() - lastHeartbeat < heartbeatIntervalMs) return;
      lastHeartbeat = Date.now();
      try {
        const response = await fetch("/api/auth/session/heartbeat", { method: "POST", cache: "no-store" });
        if (response.status === 401) await expire();
      } catch { /* The local idle timer remains authoritative during temporary network loss. */ }
    };
    const activityEvents: (keyof WindowEventMap)[] = ["pointerdown", "pointermove", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));
    const interval = window.setInterval(() => { void checkSession(); }, 5000);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void checkSession(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void checkSession();
    return () => {
      window.clearInterval(interval);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [role, returnPath]);

  return null;
}
