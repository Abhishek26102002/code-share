"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Info, LayoutGrid, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoomEditor, type SyncState } from "@/components/room/room-editor";
import { SettingsPanel } from "@/components/settings-panel";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { loadRoomKey } from "@/lib/workspace";

export function CodeRoom({ roomId }: { roomId: string }) {
  const { user } = useAuth();
  const [encryptionKey, setEncryptionKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [status, setStatus] = useState<SyncState>("connecting");
  const [notice, setNotice] = useState("Preparing secure room...");
  const [copied, setCopied] = useState(false);
  const [fullRoomUrl, setFullRoomUrl] = useState("");
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    setFullRoomUrl(window.location.href);
  }, []);

  // The key comes from the URL hash for a shared link. Somebody who owns the
  // room can also open it without the hash: their copy lives in room_keys.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setKeyError("Add Supabase environment variables to start syncing rooms.");
      return;
    }

    const hash = window.location.hash.replace("#", "");

    if (hash) {
      setEncryptionKey(hash);
      setKeyError("");
      return;
    }

    if (!user) {
      setKeyError("This room URL is missing its private encryption key.");
      return;
    }

    let active = true;

    void loadRoomKey(roomId)
      .then((key) => {
        if (!active) {
          return;
        }

        if (key) {
          setEncryptionKey(key);
          setKeyError("");
          return;
        }

        setKeyError("This room URL is missing its private encryption key.");
      })
      .catch(() => {
        if (active) {
          setKeyError("Could not open this room.");
        }
      });

    return () => {
      active = false;
    };
  }, [roomId, user]);

  const handleStatusChange = useCallback((nextStatus: SyncState, nextNotice: string) => {
    setStatus(nextStatus);
    setNotice(nextNotice);
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const iconRailButtonClassName =
    "group inline-flex h-11 items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow)] backdrop-blur-xl transition-all duration-200 hover:w-auto hover:bg-white/5 focus-visible:w-auto";

  const iconRailLabelClassName =
    "max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:ml-2 group-hover:max-w-28 group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:max-w-28 group-focus-visible:opacity-100";

  return (
    <main className="mx-auto flex h-[100dvh] min-h-[540px] w-full flex-col px-3 py-3 sm:w-[min(1600px,calc(100vw-28px))] sm:px-0 sm:py-4">
      <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/" className={iconRailButtonClassName} aria-label="Back to home">
            <ArrowLeft className="size-4" />
            <span className={iconRailLabelClassName}>Back to home</span>
          </Link>
          {user ? (
            <Link
              href="/workspace"
              className={iconRailButtonClassName}
              aria-label="Open workspace"
            >
              <LayoutGrid className="size-4" />
              <span className={iconRailLabelClassName}>Workspace</span>
            </Link>
          ) : null}
          <Button
            variant="secondary"
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="size-11 rounded-full px-0"
            aria-label="Open settings"
          >
            <Settings className="size-4" />
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => setIsInfoOpen(true)}
            className="size-11 rounded-full px-0"
            aria-label="Open room details"
          >
            <Info className="size-4" />
          </Button>
          <button
            type="button"
            onClick={copyLink}
            className={iconRailButtonClassName}
            aria-label="Copy room link"
          >
            <Copy className="size-4" />
            <span className={iconRailLabelClassName}>
              {copied ? "Link copied" : "Copy room link"}
            </span>
          </button>
        </div>
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)] backdrop-blur-xl">
        {keyError ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm leading-7 text-[var(--muted)]">
            {keyError}
          </div>
        ) : encryptionKey ? (
          <RoomEditor
            roomId={roomId}
            encryptionKey={encryptionKey}
            onStatusChange={handleStatusChange}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--muted)]">
            Preparing secure room...
          </div>
        )}
      </section>

      <Modal
        title="Room details"
        description="Everything about this room lives here so the editor stays focused."
        open={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
      >
        <div className="space-y-4">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card-strong)] p-4">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
              Room
            </div>
            <div className="mt-2 text-lg font-semibold">{roomId}</div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--card-strong)] p-4">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
                Sync status
              </div>
              <div className="mt-2 text-base font-medium capitalize">{status}</div>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{notice}</p>
            </div>

            <div className="rounded-3xl border border-[var(--border)] bg-[var(--card-strong)] p-4">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
                Link privacy
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Share the full URL. The hash part after `#` is the private key used to
                decrypt every tab in this room, and it never reaches the server.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card-strong)] p-4">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
              Room URL
            </div>
            <div className="mt-2 break-all text-sm leading-6 text-[var(--foreground)]">
              {fullRoomUrl || "Open this room in the browser to view the full share link."}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        title="Settings"
        description="Theme lives here now, and more room preferences can be added later."
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      >
        <SettingsPanel />
      </Modal>
    </main>
  );
}
