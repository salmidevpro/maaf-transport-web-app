"use client";

import { useEffect } from "react";

const messageSelector = '[role="alert"], [role="status"], [aria-live="assertive"], [aria-live="polite"]';
const ignoredMessageSelector = ".users-roles-password-check, .settings-password-mismatch";

function findMessages(node: Node): HTMLElement[] {
  if (!(node instanceof HTMLElement)) return [];
  const messages: HTMLElement[] = [];
  if (node.matches(messageSelector)) messages.push(node);
  messages.push(...Array.from(node.querySelectorAll<HTMLElement>(messageSelector)));
  return messages.filter((message) => !message.matches(ignoredMessageSelector) && !message.closest(ignoredMessageSelector));
}

export function MessageAutoScroll() {
  useEffect(() => {
    let scheduled: number | undefined;
    let target: HTMLElement | null = null;

    const scheduleScroll = (message: HTMLElement) => {
      target = message;
      if (scheduled !== undefined) window.clearTimeout(scheduled);
      scheduled = window.setTimeout(() => {
        if (!target?.isConnected) return;
        target.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          block: "center",
          inline: "nearest",
        });
        scheduled = undefined;
      }, 90);
    };

    const observer = new MutationObserver((mutations) => {
      const changed = new Set<HTMLElement>();
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => findMessages(node).forEach((message) => changed.add(message)));
          if (mutation.target instanceof HTMLElement) {
            const existing = mutation.target.closest<HTMLElement>(messageSelector);
            if (existing) changed.add(existing);
          }
        } else {
          const parent = mutation.target instanceof HTMLElement ? mutation.target : mutation.target.parentElement;
          const existing = parent?.closest<HTMLElement>(messageSelector);
          if (existing) changed.add(existing);
        }
      }
      changed.forEach(scheduleScroll);
    });

    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["role", "aria-live"] });
    return () => {
      observer.disconnect();
      if (scheduled !== undefined) window.clearTimeout(scheduled);
    };
  }, []);

  return null;
}
