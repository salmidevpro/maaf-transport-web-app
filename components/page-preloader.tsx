"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";

type TransitionEvent = CustomEvent<{ kind?: "route" | "view" }>;

export function PagePreloader() {
  const pathname = usePathname();
  // Do not cover already-rendered content during initial hydration. The loader
  // is only shown while an actual client-side navigation is underway.
  const [visible, setVisible] = useState(false);
  const pathnameRef = useRef(pathname);
  const hideTimerRef = useRef<number | null>(null);
  const failSafeTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    if (failSafeTimerRef.current !== null) window.clearTimeout(failSafeTimerRef.current);
    hideTimerRef.current = null;
    failSafeTimerRef.current = null;
  }, []);

  const start = useCallback((kind: "route" | "view") => {
    clearTimers();
    setVisible(true);
    if (kind === "view") {
      hideTimerRef.current = window.setTimeout(() => setVisible(false), 100);
      return;
    }
    failSafeTimerRef.current = window.setTimeout(() => setVisible(false), 12000);
  }, [clearTimers]);

  useEffect(() => {
    if (pathnameRef.current === pathname) return;
    pathnameRef.current = pathname;
    clearTimers();
    setVisible(false);
  }, [pathname, clearTimers]);

  useEffect(() => {
    const onTransition = (event: Event) => {
      const kind = (event as TransitionEvent).detail?.kind === "view" ? "view" : "route";
      start(kind);
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      start("route");
    };
    window.addEventListener("maaf:page-transition", onTransition);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("maaf:page-transition", onTransition);
      document.removeEventListener("click", onClick, true);
    };
  }, [start]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const isPortal = pathname.startsWith("/dashboard") || pathname.startsWith("/agent") || pathname.startsWith("/admin");
  return <div className={`page-preloader${visible ? " is-visible" : ""}`} aria-hidden={!visible}>
    <div className="page-preloader-content" role={visible ? "status" : undefined} aria-live="polite" aria-label={visible ? "Loading MAAF" : undefined}>
      <span className="page-preloader-logo"><BrandMark size={52}/><i/></span>
      <b>maaf<span>.</span></b>
      <small>{isPortal ? "Preparing your workspace" : "Loading MAAF Transport Control"}</small>
      <span className="page-preloader-track"><i/></span>
    </div>
  </div>;
}
