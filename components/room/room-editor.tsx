"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/room/code-editor";
import { decryptText } from "@/lib/crypto";
import { starterSnippet } from "@/lib/editor";
import { isExpired } from "@/lib/room";
import { supabase, type RoomRecord, type RoomTabRecord } from "@/lib/supabase";
import {
  createTab,
  deleteTab,
  loadTabs,
  renameTab,
  saveTabContent,
  type RoomTab
} from "@/lib/workspace";

export type SyncState = "connecting" | "live" | "offline" | "error";

const SYNC_DEBOUNCE_MS = 3000;

type RoomEditorProps = {
  roomId: string;
  encryptionKey: string;
  /** Extra controls for the editor toolbar, e.g. a share button. */
  toolbarExtras?: React.ReactNode;
  onStatusChange?: (status: SyncState, notice: string) => void;
};

export function RoomEditor({
  roomId,
  encryptionKey,
  toolbarExtras,
  onStatusChange
}: RoomEditorProps) {
  const [tabs, setTabs] = useState<RoomTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncState>("connecting");
  const [notice, setNotice] = useState("Opening room...");
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [copied, setCopied] = useState(false);

  const keyRef = useRef(encryptionKey);
  const latestRef = useRef(new Map<string, string>());
  const syncedRef = useRef(new Map<string, string>());
  const debounceRef = useRef<number | null>(null);
  const isFlushingRef = useRef(false);

  keyRef.current = encryptionKey;

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs]
  );

  const report = useCallback(
    (nextStatus: SyncState, nextNotice: string) => {
      setStatus(nextStatus);
      setNotice(nextNotice);
      onStatusChange?.(nextStatus, nextNotice);
    },
    [onStatusChange]
  );

  // -------------------------------------------------------------------------
  // load the room and its tabs
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!supabase) {
      report("error", "Add Supabase environment variables to start syncing rooms.");
      return;
    }

    if (!encryptionKey) {
      report("error", "This room is missing its encryption key.");
      return;
    }

    const client = supabase;
    let active = true;

    setIsReady(false);
    setTabs([]);
    setActiveTabId(null);
    latestRef.current = new Map();
    syncedRef.current = new Map();

    const openRoom = async () => {
      report("connecting", "Opening room...");

      const { data: room, error } = await client
        .from("rooms")
        .select("id, owner_id, parent_id, encrypted_name, expires_at")
        .eq("id", roomId)
        .maybeSingle<RoomRecord>();

      if (!active) {
        return;
      }

      if (error) {
        report("error", "Could not open this room.");
        return;
      }

      if (!room) {
        report("offline", "This room does not exist anymore. It may have expired.");
        return;
      }

      const expired = isExpired(room.expires_at);
      setIsReadOnly(expired);

      try {
        let loadedTabs = await loadTabs(roomId, encryptionKey);

        if (!active) {
          return;
        }

        if (loadedTabs.length === 0 && !expired) {
          loadedTabs = [await createTab(roomId, encryptionKey, "Tab 1", 0, starterSnippet)];
        }

        for (const tab of loadedTabs) {
          latestRef.current.set(tab.id, tab.content);
          syncedRef.current.set(tab.id, tab.content);
        }

        setTabs(loadedTabs);
        setActiveTabId(loadedTabs[0]?.id ?? null);
        setIsReady(!expired);
      } catch {
        if (active) {
          report("error", "The room opened, but the encryption key is invalid.");
        }

        return;
      }

      if (expired) {
        report("offline", "This room expired. The owner can reactivate or delete it.");
        return;
      }

      report("live", "Live sync is active.");
    };

    void openRoom();

    // Tabs carry the content now, so realtime follows room_tabs. Everyone in
    // the room sees new tabs, renames and edits.
    const channel = client
      .channel(`room-tabs:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_tabs",
          filter: `room_id=eq.${roomId}`
        },
        async (payload) => {
          if (!active) {
            return;
          }

          if (payload.eventType === "DELETE") {
            const removedId = (payload.old as Partial<RoomTabRecord>).id;

            if (!removedId) {
              return;
            }

            latestRef.current.delete(removedId);
            syncedRef.current.delete(removedId);
            setTabs((previous) => previous.filter((tab) => tab.id !== removedId));
            setActiveTabId((previous) => (previous === removedId ? null : previous));
            return;
          }

          const row = payload.new as RoomTabRecord;

          try {
            const content = await decryptText(row.encrypted_content, keyRef.current);
            const title = row.encrypted_title
              ? await decryptText(row.encrypted_title, keyRef.current)
              : `Tab ${row.position + 1}`;

            setTabs((previous) => {
              const existing = previous.find((tab) => tab.id === row.id);

              if (!existing) {
                latestRef.current.set(row.id, content);
                syncedRef.current.set(row.id, content);

                return [...previous, { id: row.id, roomId, title, content, position: row.position }].sort(
                  (left, right) => left.position - right.position
                );
              }

              // Never overwrite edits that have not been synced yet.
              const hasLocalEdits =
                latestRef.current.get(row.id) !== syncedRef.current.get(row.id);

              if (hasLocalEdits) {
                return previous.map((tab) =>
                  tab.id === row.id ? { ...tab, title } : tab
                );
              }

              latestRef.current.set(row.id, content);
              syncedRef.current.set(row.id, content);

              return previous.map((tab) =>
                tab.id === row.id ? { ...tab, title, content, position: row.position } : tab
              );
            });

            setActiveTabId((previous) => previous ?? row.id);
          } catch {
            report("error", "Received an update that could not be decrypted.");
          }
        }
      )
      .subscribe();

    return () => {
      active = false;

      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      void client.removeChannel(channel);
    };
  }, [encryptionKey, report, roomId]);

  // -------------------------------------------------------------------------
  // syncing
  // -------------------------------------------------------------------------
  const flushPendingChanges = useCallback(async () => {
    if (isFlushingRef.current || isReadOnly) {
      return;
    }

    const pending = Array.from(latestRef.current.entries()).filter(
      ([tabId, content]) => syncedRef.current.get(tabId) !== content
    );

    if (pending.length === 0) {
      return;
    }

    isFlushingRef.current = true;

    try {
      report("connecting", "Syncing changes...");

      for (const [tabId, content] of pending) {
        await saveTabContent(tabId, keyRef.current, content);
        syncedRef.current.set(tabId, content);
      }

      report("live", "Live sync is active.");
    } catch {
      report("error", "Failed to sync the latest changes.");
    } finally {
      isFlushingRef.current = false;
    }
  }, [isReadOnly, report]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const flushNow = () => void flushPendingChanges();
    const handleVisibilityChange = () => {
      if (document.hidden) {
        flushNow();
      }
    };

    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushNow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushNow();
    };
  }, [flushPendingChanges, isReady]);

  const handleContentChange = (value: string) => {
    if (!activeTabId || isReadOnly) {
      return;
    }

    latestRef.current.set(activeTabId, value);
    setTabs((previous) =>
      previous.map((tab) => (tab.id === activeTabId ? { ...tab, content: value } : tab))
    );

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      void flushPendingChanges();
    }, SYNC_DEBOUNCE_MS);
  };

  // -------------------------------------------------------------------------
  // tab actions
  // -------------------------------------------------------------------------
  const addTab = async () => {
    if (isReadOnly) {
      return;
    }

    try {
      const position = tabs.reduce((highest, tab) => Math.max(highest, tab.position), -1) + 1;
      const tab = await createTab(roomId, encryptionKey, `Tab ${position + 1}`, position);
      latestRef.current.set(tab.id, tab.content);
      syncedRef.current.set(tab.id, tab.content);
      setTabs((previous) =>
        previous.some((existing) => existing.id === tab.id) ? previous : [...previous, tab]
      );
      setActiveTabId(tab.id);
    } catch {
      report("error", "Could not add a tab.");
    }
  };

  const closeTab = async (tabId: string) => {
    if (isReadOnly || tabs.length <= 1) {
      return;
    }

    const remaining = tabs.filter((tab) => tab.id !== tabId);
    setTabs(remaining);
    latestRef.current.delete(tabId);
    syncedRef.current.delete(tabId);

    if (activeTabId === tabId) {
      setActiveTabId(remaining[0]?.id ?? null);
    }

    try {
      await deleteTab(tabId);
    } catch {
      report("error", "Could not close that tab.");
    }
  };

  const startRename = (tab: RoomTab) => {
    if (isReadOnly) {
      return;
    }

    setRenamingTabId(tab.id);
    setRenameDraft(tab.title);
  };

  const commitRename = async () => {
    const tabId = renamingTabId;
    const title = renameDraft.trim();
    setRenamingTabId(null);

    if (!tabId || !title) {
      return;
    }

    setTabs((previous) =>
      previous.map((tab) => (tab.id === tabId ? { ...tab, title } : tab))
    );

    try {
      await renameTab(tabId, encryptionKey, title);
    } catch {
      report("error", "Could not rename that tab.");
    }
  };

  const copyActiveTab = async () => {
    if (!activeTab) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeTab.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const downloadActiveTab = () => {
    if (!activeTab) {
      return;
    }

    const blob = new Blob([activeTab.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeTab.title.replace(/[^\w.-]+/g, "-") || roomId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] px-2 py-2">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;

          return (
            <div
              key={tab.id}
              className={`group flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? "border-[var(--border)] bg-[var(--card-strong)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted)] hover:bg-white/5"
              }`}
            >
              {renamingTabId === tab.id ? (
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onBlur={() => void commitRename()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void commitRename();
                    }

                    if (event.key === "Escape") {
                      setRenamingTabId(null);
                    }
                  }}
                  className="w-28 bg-transparent text-sm outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  onDoubleClick={() => startRename(tab)}
                  className="max-w-40 truncate"
                  title={`${tab.title} (double click to rename)`}
                >
                  {tab.title}
                </button>
              )}

              {tabs.length > 1 && !isReadOnly ? (
                <button
                  type="button"
                  onClick={() => void closeTab(tab.id)}
                  className="rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Close ${tab.title}`}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}

        {!isReadOnly ? (
          <button
            type="button"
            onClick={() => void addTab()}
            className="ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-white/5"
            aria-label="Add tab"
            title="Add tab"
          >
            <Plus className="size-4" />
          </button>
        ) : null}
      </div>

      <CodeEditor
        value={activeTab?.content ?? ""}
        onChange={handleContentChange}
        disabled={!isReady || !activeTab}
        placeholder={isReady ? "Paste your code here" : "Room unavailable"}
        toolbarStart={
          <>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => void copyActiveTab()}
              className="rounded-full"
              disabled={!activeTab}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Code copied" : "Copy code"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={downloadActiveTab}
              className="rounded-full"
              disabled={!activeTab}
            >
              <Download className="size-4" />
              Download .txt
            </Button>
            {toolbarExtras}
          </>
        }
        toolbarEnd={
          <>
            <span className="hidden sm:inline">{notice}</span>
            <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs uppercase tracking-[0.18em]">
              {status}
            </span>
          </>
        }
      />
    </div>
  );
}
