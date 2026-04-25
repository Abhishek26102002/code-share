"use client";

import { ThemeToggle } from "@/components/theme-toggle";

export function SettingsPanel() {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--card-strong)] p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
        Settings
      </div>
      <ThemeToggle />
    </section>
  );
}
