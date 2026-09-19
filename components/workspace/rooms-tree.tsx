"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, FolderOpen, Plus } from "lucide-react";
import type { WorkspaceRoom } from "@/lib/workspace";

type RoomsTreeProps = {
  rooms: WorkspaceRoom[];
  selectedRoomId: string | null;
  onSelect: (room: WorkspaceRoom) => void;
  onAddSubroom?: (parent: WorkspaceRoom) => void;
  emptyLabel?: string;
};

export function RoomsTree({
  rooms,
  selectedRoomId,
  onSelect,
  onAddSubroom,
  emptyLabel = "No rooms yet."
}: RoomsTreeProps) {
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);

  const toggle = (roomId: string) =>
    setCollapsedIds((previous) =>
      previous.includes(roomId)
        ? previous.filter((id) => id !== roomId)
        : [...previous, roomId]
    );

  if (rooms.length === 0) {
    return <p className="px-3 py-2 text-sm text-[var(--muted)]">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-0.5">
      {rooms.map((room) => {
        const isCollapsed = collapsedIds.includes(room.id);

        return (
          <li key={room.id}>
            <RoomRow
              room={room}
              depth={0}
              isSelected={room.id === selectedRoomId}
              isCollapsed={isCollapsed}
              onToggle={() => toggle(room.id)}
              onSelect={() => onSelect(room)}
              onAddSubroom={onAddSubroom ? () => onAddSubroom(room) : undefined}
            />

            {room.children.length > 0 && !isCollapsed ? (
              <ul className="mt-0.5 space-y-0.5 border-l border-[var(--border)] pl-2 ml-4">
                {room.children.map((child) => (
                  <li key={child.id}>
                    <RoomRow
                      room={child}
                      depth={1}
                      isSelected={child.id === selectedRoomId}
                      isCollapsed={false}
                      onSelect={() => onSelect(child)}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function RoomRow({
  room,
  depth,
  isSelected,
  isCollapsed,
  onToggle,
  onSelect,
  onAddSubroom
}: {
  room: WorkspaceRoom;
  depth: number;
  isSelected: boolean;
  isCollapsed: boolean;
  onToggle?: () => void;
  onSelect: () => void;
  onAddSubroom?: () => void;
}) {
  const hasChildren = room.children.length > 0;

  return (
    <div
      className={`group flex items-center gap-1 rounded-2xl px-2 py-1.5 text-sm transition-colors ${
        isSelected
          ? "bg-[var(--card-strong)] text-[var(--foreground)]"
          : "text-[var(--muted)] hover:bg-white/5"
      }`}
    >
      {depth === 0 ? (
        <button
          type="button"
          onClick={onToggle}
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded-lg ${
            hasChildren ? "hover:bg-white/10" : "opacity-0"
          }`}
          aria-label={isCollapsed ? `Expand ${room.name}` : `Collapse ${room.name}`}
          tabIndex={hasChildren ? 0 : -1}
        >
          {isCollapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
      ) : null}

      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        title={room.name}
      >
        {depth === 0 ? (
          <FolderOpen className="size-4 shrink-0" />
        ) : (
          <FileCode2 className="size-4 shrink-0" />
        )}
        <span className="truncate">{room.name}</span>
        {room.expired ? (
          <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.16em]">
            Expired
          </span>
        ) : null}
      </button>

      {onAddSubroom ? (
        <button
          type="button"
          onClick={onAddSubroom}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Add a subroom inside ${room.name}`}
          title="Add subroom"
        >
          <Plus className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
