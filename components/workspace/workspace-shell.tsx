"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FolderPlus,
  Layers,
  Menu,
  Settings as SettingsIcon,
  ShieldCheck,
  Users
} from "lucide-react";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { AccountPanel } from "@/components/workspace/account-panel";
import { RoomPanel } from "@/components/workspace/room-panel";
import { RoomsTree } from "@/components/workspace/rooms-tree";
import { TeamsPanel } from "@/components/workspace/teams-panel";
import { useAuth } from "@/lib/auth";
import { EXPIRY_CHOICES, type ExpiryChoice } from "@/lib/room";
import {
  countPendingInvites,
  createAccountRoom,
  loadWorkspaceRooms,
  type WorkspaceRoom
} from "@/lib/workspace";

type View = "rooms" | "teams" | "settings";

const INVITE_POLL_MS = 45000;

const flatten = (rooms: WorkspaceRoom[]): WorkspaceRoom[] =>
  rooms.flatMap((room) => [room, ...room.children]);

export function WorkspaceShell() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [rooms, setRooms] = useState<WorkspaceRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [view, setView] = useState<View>("rooms");
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [inviteCount, setInviteCount] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [newRoomParent, setNewRoomParent] = useState<WorkspaceRoom | null>(null);
  const [isNewRoomOpen, setIsNewRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomExpiry, setNewRoomExpiry] = useState<ExpiryChoice>("never");
  const [isCreating, setIsCreating] = useState(false);

  const refreshRooms = useCallback(async () => {
    if (!user) {
      return;
    }

    setIsLoadingRooms(true);

    try {
      setRooms(await loadWorkspaceRooms());
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load your rooms.");
    } finally {
      setIsLoadingRooms(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshRooms();
  }, [refreshRooms]);

  useEffect(() => {
    if (!user?.email) {
      return;
    }

    const email = user.email;
    const check = () => void countPendingInvites(email).then(setInviteCount);

    check();
    const timer = window.setInterval(check, INVITE_POLL_MS);

    return () => window.clearInterval(timer);
  }, [user?.email]);

  const ownRooms = useMemo(
    () => rooms.filter((room) => room.ownerId === user?.id),
    [rooms, user?.id]
  );

  const sharedRooms = useMemo(
    () => rooms.filter((room) => room.ownerId !== user?.id),
    [rooms, user?.id]
  );

  const selectedRoom = useMemo(
    () => flatten(rooms).find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );

  const openNewRoom = (parent: WorkspaceRoom | null) => {
    setNewRoomParent(parent);
    setNewRoomName(parent ? "New subroom" : "New room");
    setNewRoomExpiry("never");
    setIsNewRoomOpen(true);
  };

  const createRoom = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user) {
      return;
    }

    setIsCreating(true);

    try {
      const { roomId } = await createAccountRoom({
        ownerId: user.id,
        name: newRoomName.trim() || "Untitled room",
        parentId: newRoomParent?.id ?? null,
        expiry: newRoomExpiry
      });

      setIsNewRoomOpen(false);
      await refreshRooms();
      setSelectedRoomId(roomId);
      setView("rooms");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create the room.");
    } finally {
      setIsCreating(false);
    }
  };

  if (isAuthLoading) {
    return (
      <main className="flex h-[100dvh] items-center justify-center text-sm text-[var(--muted)]">
        Loading your workspace...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex h-[100dvh] w-[min(520px,calc(100vw-32px))] flex-col items-center justify-center gap-5 text-center">
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">
          Sign in to open your workspace
        </h1>
        <p className="text-sm leading-7 text-[var(--muted)]">
          Rooms, subrooms, tabs and teams live behind an account. You can keep using
          link-only rooms without one.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={() => setIsAuthOpen(true)}>
            Sign in or create an account
          </Button>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] px-5 text-sm font-medium"
          >
            Back to home
          </Link>
        </div>

        <AuthDialog open={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      </main>
    );
  }

  const navItems: { value: View; label: string; icon: React.ReactNode; badge?: number }[] = [
    { value: "rooms", label: "Rooms", icon: <Layers className="size-4" /> },
    { value: "teams", label: "Teams", icon: <Users className="size-4" />, badge: inviteCount },
    { value: "settings", label: "Settings", icon: <SettingsIcon className="size-4" /> }
  ];

  return (
    <main className="flex h-[100dvh] min-h-[540px] w-full gap-3 p-3">
      <aside
        className={`${
          isSidebarOpen ? "flex" : "hidden"
        } fixed inset-3 z-40 w-[min(300px,calc(100vw-24px))] flex-col rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow)] backdrop-blur-xl sm:static sm:z-auto sm:flex sm:w-[286px] sm:shrink-0`}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-[var(--accent)]" />
            Code Share
          </Link>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="rounded-full border border-[var(--border)] px-3 py-1 text-xs sm:hidden"
          >
            Close
          </button>
        </div>

        <nav className="mb-3 space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setView(item.value);
                setIsSidebarOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-colors ${
                view === item.value
                  ? "bg-[var(--card-strong)] text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:bg-white/5"
              }`}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[0.65rem] font-semibold text-[var(--accent-foreground)]">
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="mb-2 flex items-center justify-between px-3">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
            Rooms
          </span>
          <button
            type="button"
            onClick={() => openNewRoom(null)}
            className="inline-flex size-6 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-white/10"
            aria-label="New room"
            title="New room"
          >
            <FolderPlus className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {isLoadingRooms ? (
            <p className="px-3 py-2 text-sm text-[var(--muted)]">Loading rooms...</p>
          ) : (
            <RoomsTree
              rooms={ownRooms}
              selectedRoomId={selectedRoomId}
              onSelect={(room) => {
                setSelectedRoomId(room.id);
                setView("rooms");
                setIsSidebarOpen(false);
              }}
              onAddSubroom={(parent) => openNewRoom(parent)}
              emptyLabel="No rooms yet. Create one to get started."
            />
          )}

          {sharedRooms.length > 0 ? (
            <>
              <div className="mt-4 mb-2 px-3 text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
                Shared with you
              </div>
              <RoomsTree
                rooms={sharedRooms}
                selectedRoomId={selectedRoomId}
                onSelect={(room) => {
                  setSelectedRoomId(room.id);
                  setView("rooms");
                  setIsSidebarOpen(false);
                }}
              />
            </>
          ) : null}
        </div>

        <div className="mt-3 truncate rounded-2xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
          {user.email}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center gap-2 sm:hidden">
          <Button
            variant="secondary"
            type="button"
            className="size-11 rounded-full px-0"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="size-4" />
          </Button>
          <span className="truncate text-sm font-medium">
            {view === "rooms" ? selectedRoom?.name ?? "Rooms" : view === "teams" ? "Teams" : "Settings"}
          </span>
        </div>

        {errorMessage ? (
          <p className="shrink-0 text-sm text-[var(--accent-strong)]">{errorMessage}</p>
        ) : null}

        {view === "rooms" ? (
          selectedRoom ? (
            <RoomPanel
              room={selectedRoom}
              isOwner={selectedRoom.ownerId === user.id}
              onAddSubroom={(parent) => openNewRoom(parent)}
              onRefresh={() => void refreshRooms()}
              onDeleted={(roomId) => {
                setSelectedRoomId((previous) => (previous === roomId ? null : previous));
                void refreshRooms();
              }}
            />
          ) : (
            <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-[1.5rem] border border-dashed border-[var(--border)] p-8 text-center">
              <h2 className="text-xl font-semibold tracking-[-0.03em]">
                Pick a room, or start a new one
              </h2>
              <p className="max-w-[46ch] text-sm leading-7 text-[var(--muted)]">
                A room holds as many tabs as you need, and can hold subrooms. Sharing a
                room link shares that room and its tabs only, never the rest of your
                workspace.
              </p>
              <Button type="button" onClick={() => openNewRoom(null)}>
                <FolderPlus className="size-4" />
                New room
              </Button>
            </section>
          )
        ) : null}

        {view === "teams" ? (
          <TeamsPanel
            userId={user.id}
            email={user.email ?? ""}
            onMembershipChange={() => void refreshRooms()}
          />
        ) : null}

        {view === "settings" ? <AccountPanel /> : null}
      </div>

      <Modal
        title={newRoomParent ? `New subroom in ${newRoomParent.name}` : "New room"}
        description="The name is encrypted in your browser, just like the code inside."
        open={isNewRoomOpen}
        onClose={() => setIsNewRoomOpen(false)}
      >
        <form className="space-y-4" onSubmit={(event) => void createRoom(event)}>
          <Field label="Name">
            <Input
              autoFocus
              value={newRoomName}
              onChange={(event) => setNewRoomName(event.target.value)}
              placeholder="Auth refactor"
            />
          </Field>

          <Field
            label="Expires"
            hint={EXPIRY_CHOICES.find((choice) => choice.value === newRoomExpiry)?.hint}
          >
            <Select
              value={newRoomExpiry}
              onChange={(event) => setNewRoomExpiry(event.target.value as ExpiryChoice)}
            >
              {EXPIRY_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsNewRoomOpen(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Creating..." : "Create room"}
            </Button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
