"use client";

import { LogOut } from "lucide-react";

export function LogoutButton({ label = "Sign out", compact = false }: { label?: string; compact?: boolean }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }
  return <button type="button" className={compact ? "logout-compact" : "logout-button"} onClick={logout} aria-label={label}><LogOut size={16}/>{!compact&&label}</button>;
}
