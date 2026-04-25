"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Info, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { decryptText, encryptText } from "@/lib/crypto";
import { starterSnippet } from "@/lib/editor";
import { SettingsPanel } from "@/components/settings-panel";
import { Modal } from "@/components/ui/modal";
import { isSupabaseConfigured, supabase, type RoomRecord } from "@/lib/supabase";

type SyncState = "connecting" | "live" | "offline" | "error";
const SYNC_DEBOUNCE_MS = 3000;

export function CodeRoom({ roomId }: { roomId: string }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<SyncState>("connecting");
  const [notice, setNotice] = useState("Preparing secure room...");
  const [copied, setCopied] = useState(false);
  const [fullRoomUrl, setFullRoomUrl] = useState("");
  const [isRoomReady, setIsRoomReady] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const secretRef = useRef("");
  const lastSyncedContentRef = useRef("");
  const latestCodeRef = useRef("");
  const debounceRef = useRef<number | null>(null);
  const isFlushingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFullRoomUrl(window.location.href);
  }, []);

  useEffect(() => {
    latestCodeRef.current = code;
  }, [code]);

  const lineNumbers = useMemo(() => {
    const lineCount = Math.max(1, code.split("\n").length);
    return Array.from({ length: lineCount }, (_, index) => index + 1);
  }, [code]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setStatus("error");
      setNotice("Add Supabase environment variables to start syncing rooms.");
      return;
    }

    const hash = window.location.hash.replace("#", "");

    if (!hash) {
      setStatus("error");
      setNotice("This room URL is missing its private encryption key.");
      return;
    }

    secretRef.current = hash;
    const client = supabase;
    let active = true;

    const ensureRoom = async () => {
      setStatus("connecting");
      setNotice("Joining room...");

      const { data, error } = await client
        .from("rooms")
        .select("id, encrypted_content, expires_at, updated_at")
        .eq("id", roomId)
        .maybeSingle<RoomRecord>();

      if (!active) {
        return;
      }

      if (error) {
        setStatus("error");
        setNotice("Could not open this room.");
        return;
      }

      if (!data) {
        setStatus("offline");
        setNotice("This room does not exist anymore. It may have expired.");
        setIsRoomReady(false);
        return;
      }

      if (new Date(data.expires_at).getTime() <= Date.now()) {
        setStatus("offline");
        setNotice("This room expired after 24 hours.");
        setIsRoomReady(false);
        return;
      }

      try {
        const decrypted = await decryptText(data.encrypted_content, hash);
        const nextCode = decrypted || starterSnippet;
        lastSyncedContentRef.current = nextCode;
        latestCodeRef.current = nextCode;
        setCode(nextCode);
        setIsRoomReady(true);
      } catch {
        setStatus("error");
        setNotice("The room opened, but the encryption key is invalid.");
        return;
      }

      setStatus("live");
      setNotice("Live sync is active.");
    };

    void ensureRoom();

    const channel = client
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`
        },
        async (payload) => {
          const nextContent = payload.new.encrypted_content as string;

          if (!nextContent || nextContent === payload.old.encrypted_content) {
            return;
          }

          try {
            const decrypted = await decryptText(nextContent, secretRef.current);
            const hasUnsyncedLocalChanges =
              latestCodeRef.current !== lastSyncedContentRef.current;

            if (!hasUnsyncedLocalChanges && decrypted !== lastSyncedContentRef.current) {
              lastSyncedContentRef.current = decrypted;
              latestCodeRef.current = decrypted;
              setCode(decrypted);
            }

            setStatus("live");
            setNotice("Live sync is active.");
          } catch {
            setStatus("error");
            setNotice("Received an update that could not be decrypted.");
          }
        }
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") {
          setStatus("live");
        }
      });

    return () => {
      active = false;

      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }

      void client.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !secretRef.current || !isRoomReady) {
      return;
    }

    const client = supabase;

    const flushPendingChanges = () => {
      if (isFlushingRef.current) {
        return;
      }

      if (latestCodeRef.current === lastSyncedContentRef.current) {
        return;
      }

      isFlushingRef.current = true;

      void (async () => {
        try {
          setStatus("connecting");
          setNotice("Syncing changes...");
          const encrypted = await encryptText(latestCodeRef.current, secretRef.current);
          const { error } = await client
            .from("rooms")
            .update({ encrypted_content: encrypted })
            .eq("id", roomId);

          if (error) {
            setStatus("error");
            setNotice("Failed to sync the latest changes.");
            return;
          }

          lastSyncedContentRef.current = latestCodeRef.current;
          setStatus("live");
          setNotice("Live sync is active.");
        } catch {
          setStatus("error");
          setNotice("Failed to encrypt or sync the latest changes.");
        } finally {
          isFlushingRef.current = false;
        }
      })();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        flushPendingChanges();
      }
    };

    window.addEventListener("pagehide", flushPendingChanges);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushPendingChanges);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isRoomReady, roomId]);

  useEffect(() => {
    if (
      !isSupabaseConfigured ||
      !supabase ||
      !secretRef.current ||
      !isRoomReady ||
      status === "error" ||
      status === "offline"
    ) {
      return;
    }

    if (code === lastSyncedContentRef.current) {
      return;
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      const client = supabase!;

      void (async () => {
        try {
          setStatus("connecting");
          setNotice("Syncing changes...");
          const encrypted = await encryptText(code, secretRef.current);
          const { error } = await client
            .from("rooms")
            .update({ encrypted_content: encrypted })
            .eq("id", roomId);

          if (error) {
            setStatus("error");
            setNotice("Failed to sync the latest changes.");
            return;
          }

          lastSyncedContentRef.current = code;
          setStatus("live");
          setNotice("Live sync is active.");
        } catch {
          setStatus("error");
          setNotice("Failed to encrypt or sync the latest changes.");
        }
      })();
    }, SYNC_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [code, isRoomReady, roomId, status]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const syncGutterScroll = () => {
    if (!textareaRef.current || !gutterRef.current) {
      return;
    }

    gutterRef.current.scrollTop = textareaRef.current.scrollTop;
  };

  const iconRailButtonClassName =
    "group inline-flex h-11 items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow)] backdrop-blur-xl transition-all duration-200 hover:w-auto hover:bg-white/5 focus-visible:w-auto";

  const iconRailLabelClassName =
    "max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:ml-2 group-hover:max-w-28 group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:max-w-28 group-focus-visible:opacity-100";

  return (
    <main className="mx-auto w-full py-7 sm:w-[min(1160px,calc(100vw-40px))] sm:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/"
            className={iconRailButtonClassName}
            aria-label="Back to home"
          >
            <ArrowLeft className="size-4" />
            <span className={iconRailLabelClassName}>Back to home</span>
          </Link>
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

      <section className="overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          <span>Live editor</span>
          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs uppercase tracking-[0.18em]">
            {status}
          </span>
        </div>

        <div className="grid grid-cols-[auto_1fr] bg-[var(--editor)]">
          <div
            ref={gutterRef}
            aria-hidden="true"
            className="max-h-[68vh] overflow-hidden border-r border-[var(--border)] bg-black/4 px-3 py-5 text-right font-mono text-[0.95rem] leading-7 text-[var(--muted)] select-none"
          >
            {lineNumbers.map((lineNumber) => (
              <div key={lineNumber}>{lineNumber}</div>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onScroll={syncGutterScroll}
            spellCheck={false}
            disabled={!isRoomReady}
            placeholder={isRoomReady ? "Paste your code here" : "Room unavailable"}
            wrap="off"
            className="min-h-[68vh] max-h-[68vh] w-full resize-none overflow-auto border-0 bg-[var(--editor)] px-5 py-5 font-mono text-[0.95rem] leading-7 text-[var(--foreground)] outline-none disabled:opacity-60"
          />
        </div>
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
                decrypt the room in the browser.
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
