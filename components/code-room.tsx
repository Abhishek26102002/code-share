"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { decryptText, encryptText } from "@/lib/crypto";
import { starterSnippet } from "@/lib/editor";
import { SettingsPanel } from "@/components/settings-panel";
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
  const secretRef = useRef("");
  const lastSyncedContentRef = useRef("");
  const latestCodeRef = useRef("");
  const debounceRef = useRef<number | null>(null);
  const isFlushingRef = useRef(false);

  useEffect(() => {
    setFullRoomUrl(window.location.href);
  }, []);

  useEffect(() => {
    latestCodeRef.current = code;
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

  return (
    <main className="mx-auto w-[min(1160px,calc(100vw-32px))] py-7 sm:w-[min(1160px,calc(100vw-40px))] sm:py-8">
      <div className="mb-5 flex flex-wrap justify-between gap-4">
        <div className="grid gap-2.5">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-[var(--shadow)] backdrop-blur-xl"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
          <div>
            <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-semibold tracking-[-0.04em]">
              Room {roomId}
            </h1>
            <p className="mt-2.5 max-w-[62ch] leading-7 text-[var(--muted)]">
              Share the full URL to collaborate. The hash part after `#` is the private
              key used to decrypt the code in the browser.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-2.5">
          <SettingsPanel />
          <Button variant="secondary" type="button" onClick={copyLink} className="h-11 px-5">
            <Copy className="size-4" />
            {copied ? "Link copied" : "Copy room link"}
          </Button>
        </div>
      </div>

      <section className="mb-4 rounded-[1.75rem] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)] backdrop-blur-xl">
        <div className="grid gap-2.5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="text-sm text-[var(--muted)]">{notice}</div>
          <div className="inline-flex w-fit items-center rounded-full border border-[var(--border)] px-3 py-1.5 text-sm capitalize">
            {status}
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card-strong)_80%,transparent_20%)] px-4 py-3 text-sm leading-6 break-all text-[var(--muted)]">
          <div className="mb-1 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-[var(--foreground)]/70">
            <Link2 className="size-3.5" />
            Room URL
          </div>
          {fullRoomUrl || "Open this room in the browser to copy the full share link."}
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)] backdrop-blur-xl">
        <div className="border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          Live editor
        </div>

        <textarea
          value={code}
          onChange={(event) => setCode(event.target.value)}
          spellCheck={false}
          disabled={!isRoomReady}
          placeholder={isRoomReady ? "Paste your code here" : "Room unavailable"}
          className="min-h-[68vh] w-full resize-y border-0 bg-[var(--editor)] px-5 py-5 font-mono text-[0.95rem] leading-7 text-[var(--foreground)] outline-none disabled:opacity-60"
        />
      </section>
    </main>
  );
}
