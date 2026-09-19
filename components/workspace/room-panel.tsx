"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { RoomEditor } from "@/components/room/room-editor";
import { describeExpiry, EXPIRY_CHOICES, type ExpiryChoice } from "@/lib/room";
import { deleteRoom, renameRoom, setRoomExpiry, type WorkspaceRoom } from "@/lib/workspace";

type RoomPanelProps = {
  room: WorkspaceRoom;
  isOwner: boolean;
  onAddSubroom: (parent: WorkspaceRoom) => void;
  onRefresh: () => void;
  onDeleted: (roomId: string) => void;
};

export function RoomPanel({
  room,
  isOwner,
  onAddSubroom,
  onRefresh,
  onDeleted
}: RoomPanelProps) {
  const [nameDraft, setNameDraft] = useState(room.name);
  const [isRenaming, setIsRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setNameDraft(room.name);
    setIsRenaming(false);
    setConfirmDelete(false);
    setErrorMessage("");
  }, [room.id, room.name]);

  const commitRename = async () => {
    setIsRenaming(false);
    const name = nameDraft.trim();

    if (!name || name === room.name) {
      setNameDraft(room.name);
      return;
    }

    try {
      await renameRoom(room.id, room.encryptionKey, name);
      onRefresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not rename the room.");
    }
  };

  const changeExpiry = async (choice: ExpiryChoice) => {
    try {
      await setRoomExpiry(room.id, choice);
      onRefresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not change the expiry.");
    }
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/${room.id}#${room.encryptionKey}`
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const removeRoom = async () => {
    try {
      await deleteRoom(room.id);
      onDeleted(room.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not delete the room.");
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)] backdrop-blur-xl">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {isRenaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void commitRename();
                }

                if (event.key === "Escape") {
                  setNameDraft(room.name);
                  setIsRenaming(false);
                }
              }}
              className="w-56 rounded-xl border border-[var(--input)] bg-[var(--card-strong)] px-3 py-1.5 text-base font-semibold outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => isOwner && setIsRenaming(true)}
              className="truncate text-base font-semibold tracking-[-0.02em]"
              title={isOwner ? "Click to rename" : room.name}
            >
              {room.name}
            </button>
          )}
          <span className="shrink-0 rounded-full border border-[var(--border)] px-2.5 py-0.5 font-mono text-xs text-[var(--muted)]">
            {room.id}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--muted)]">{describeExpiry(room.expiresAt)}</span>

          {isOwner ? (
            <Select
              aria-label="Room expiry"
              className="h-9 w-auto text-xs"
              value=""
              onChange={(event) => {
                const choice = event.target.value as ExpiryChoice;

                if (choice) {
                  void changeExpiry(choice);
                }
              }}
            >
              <option value="">Set expiry</option>
              {EXPIRY_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </Select>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            type="button"
            className="rounded-full"
            onClick={() => void copyShareLink()}
          >
            {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
            {copied ? "Link copied" : "Share"}
          </Button>

          {isOwner && !room.parentId ? (
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="rounded-full"
              onClick={() => onAddSubroom(room)}
            >
              <Plus className="size-4" />
              Subroom
            </Button>
          ) : null}

          {isOwner ? (
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="rounded-full"
              onClick={() => (confirmDelete ? void removeRoom() : setConfirmDelete(true))}
              onBlur={() => setConfirmDelete(false)}
            >
              <Trash2 className="size-4" />
              {confirmDelete ? "Click again to delete" : "Delete"}
            </Button>
          ) : null}
        </div>
      </header>

      {room.expired ? (
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--card-strong)] px-3 py-2 text-sm text-[var(--muted)]">
          This room expired, so it is read only and nobody else can see it. Pick a new
          expiry above to bring it back, or delete it.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="shrink-0 border-b border-[var(--border)] px-3 py-2 text-sm text-[var(--accent-strong)]">
          {errorMessage}
        </div>
      ) : null}

      <RoomEditor
        key={room.id}
        roomId={room.id}
        encryptionKey={room.encryptionKey}
        toolbarExtras={
          <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
            <Copy className="size-3.5" />
            Tabs share this room link
          </span>
        }
      />
    </section>
  );
}
