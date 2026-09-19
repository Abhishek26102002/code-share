"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LayoutGrid, LogIn, ShieldCheck } from "lucide-react";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { SettingsPanel } from "@/components/settings-panel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { buildRoomUrl } from "@/lib/room";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createAnonymousRoom } from "@/lib/workspace";

export function LandingHero() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const createRoom = async () => {
    if (!isSupabaseConfigured) {
      setErrorMessage("Supabase is not configured yet.");
      return;
    }

    setIsCreating(true);
    setErrorMessage("");

    try {
      const { roomId, encryptionKey } = await createAnonymousRoom();
      router.push(buildRoomUrl(roomId, encryptionKey));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not create a room right now."
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <main className="mx-auto w-[min(1160px,calc(100vw-32px))] py-7 sm:w-[min(1160px,calc(100vw-40px))] sm:py-14">
      <header className="mb-11 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-[var(--shadow)] backdrop-blur-xl">
          <ShieldCheck className="size-4 text-[var(--accent)]" />
          Code Share
        </div>

        {isLoading ? null : user ? (
          <Link
            href="/workspace"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-medium shadow-[var(--shadow)] backdrop-blur-xl"
          >
            <LayoutGrid className="size-4" />
            Open workspace
          </Link>
        ) : (
          <Button variant="secondary" type="button" onClick={() => setIsAuthOpen(true)}>
            <LogIn className="size-4" />
            Sign in
          </Button>
        )}
      </header>

      <section className="grid gap-7 rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-8 shadow-[var(--shadow)] backdrop-blur-xl">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)]">
          Live code rooms without email, chat limits, or file attachments
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h1 className="max-w-[10ch] text-[clamp(3rem,8vw,6.4rem)] leading-[0.94] font-semibold tracking-[-0.06em]">
              Share code in a private live room.
            </h1>

            <p className="mt-5 max-w-[58ch] text-lg leading-8 text-[var(--muted)]">
              Start a room, copy the link, and both developers can edit the same tabs in
              real time. Room content is encrypted in the browser before it is synced. A
              link-only room expires after 24 hours; with an account you keep rooms,
              subrooms and tabs for as long as you want.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => void createRoom()}
                disabled={isCreating}
                className="h-12 px-6"
              >
                {isCreating ? "Creating room..." : "Start secure room"}
                <ArrowRight className="size-4" />
              </Button>
              {user ? (
                <Link
                  href="/workspace"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--border)] bg-transparent px-6 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-white/5"
                >
                  Open workspace
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAuthOpen(true)}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--border)] bg-transparent px-6 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-white/5"
                >
                  Create an account
                </button>
              )}
            </div>

            {errorMessage ? (
              <p className="mt-3 text-sm text-[var(--accent-strong)]">{errorMessage}</p>
            ) : null}
          </div>

          <div className="min-h-[320px] rounded-[1.75rem] border border-[var(--border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card-strong)_88%,white_12%),color-mix(in_srgb,var(--card-strong)_86%,black_14%))] p-5">
            <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--editor)]">
              <div className="flex gap-2 border-b border-[var(--border)] px-4 py-3">
                <span className="inline-flex items-center rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium">
                  room.ts
                </span>
                <span className="inline-flex items-center rounded-full px-3 py-1 text-xs text-[var(--muted)]">
                  notes.md
                </span>
              </div>
              <pre className="m-0 overflow-x-auto p-5 font-mono text-[0.92rem] leading-7 text-[var(--foreground)]">{`export function shareCode(url: string) {
  return {
    room: url,
    mode: "live",
    encrypted: true
  };
}`}</pre>
            </div>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]"
      >
        {[
          "Open the app and generate a room URL with one click.",
          "Send the full URL to another developer.",
          "Paste or edit code together across as many tabs as you need.",
          "Sign in to keep rooms, group them into subrooms, and share them with your team."
        ].map((item, index) => (
          <article
            key={item}
            className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)] backdrop-blur-xl"
          >
            <div className="mb-3 text-sm font-semibold text-[var(--accent)]">0{index + 1}</div>
            <p className="m-0 leading-7 text-[var(--muted)]">{item}</p>
          </article>
        ))}
      </section>

      <div className="mt-5">
        <SettingsPanel />
      </div>

      <AuthDialog open={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </main>
  );
}
