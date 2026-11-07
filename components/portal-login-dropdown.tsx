"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export function PortalDropdown({ label, variant = "login" }: { label: string; variant?: "login" | "header" }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !dropdownRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className={`portal-dropdown controlled-portal-dropdown ${variant}-portal-dropdown`} ref={dropdownRef} data-open={isOpen}>
      <button
        className="portal-dropdown-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
      >
        {label} <ChevronDown size={17} />
      </button>
      <div className="portal-dropdown-menu controlled-portal-menu" id={menuId} role="menu" aria-hidden={!isOpen}>
        <a href="/agent/login" role="menuitem" tabIndex={isOpen ? 0 : -1}>Agent Portal</a>
        <a href="/admin/login" role="menuitem" tabIndex={isOpen ? 0 : -1}>Admin Portal</a>
      </div>
    </div>
  );
}
