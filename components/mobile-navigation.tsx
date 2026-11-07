"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

type MobileNavigationItem = { key: string; label: string; href: string };

export function MobileNavigation({ items, active }: { items: MobileNavigationItem[]; active?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
        rootRef.current?.querySelector<HTMLButtonElement>(".site-mobile-menu-toggle")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closing]);

  function closeMenu() {
    if (!open || closing) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimerRef.current = null;
    }, 180);
  }

  function toggleMenu() {
    if (open && !closing) {
      closeMenu();
      return;
    }
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setClosing(false);
    setOpen(true);
  }

  const expanded = open && !closing;

  return <div className="site-mobile-menu" ref={rootRef}>
    <button className="site-mobile-menu-toggle" type="button" aria-label={expanded ? "Close navigation" : "Open navigation"} aria-expanded={expanded} aria-controls="site-mobile-menu-panel" onClick={toggleMenu}>
      {expanded ? <X size={22}/> : <Menu size={22}/>}
    </button>
    <nav id="site-mobile-menu-panel" className={`site-mobile-menu-panel${expanded ? " is-visible" : ""}`} aria-label="Mobile navigation" aria-hidden={!expanded} inert={!expanded}>
      {items.map((item) => <a key={item.key} href={item.href} aria-current={active === item.key ? "page" : undefined}>{item.label}</a>)}
      <div className="mobile-portal-links"><span>PORTALS</span><a href="/agent/login">Agent Portal</a><a href="/admin/login">Admin Portal</a></div>
    </nav>
  </div>;
}
