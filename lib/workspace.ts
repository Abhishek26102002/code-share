import { decryptText, encryptText } from "@/lib/crypto";
import { starterSnippet } from "@/lib/editor";
import {
  ANONYMOUS_ROOM_LIFETIME_MS,
  createRoomId,
  createRoomKey,
  expiryChoiceToTimestamp,
  isExpired,
  type ExpiryChoice
} from "@/lib/room";
import {
  supabase,
  type ProfileRecord,
  type RoomRecord,
  type RoomTabRecord,
  type TeamInviteRecord,
  type TeamMemberRecord,
  type TeamRecord
} from "@/lib/supabase";

const MAX_ROOM_ID_ATTEMPTS = 8;
const DUPLICATE_KEY = "23505";

export type WorkspaceRoom = {
  id: string;
  ownerId: string | null;
  parentId: string | null;
  name: string;
  expiresAt: string | null;
  expired: boolean;
  encryptionKey: string;
  children: WorkspaceRoom[];
};

export type RoomTab = {
  id: string;
  roomId: string;
  title: string;
  content: string;
  position: number;
};

export type TeamOverview = {
  teamId: string | null;
  members: { id: string; userId: string; email: string; role: "owner" | "member" }[];
  sentInvites: TeamInviteRecord[];
  receivedInvites: (TeamInviteRecord & { fromEmail: string; teamName: string })[];
  joinedTeams: { teamId: string; ownerEmail: string; name: string; membershipId: string | null }[];
};

export const requireClient = () => {
  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  return supabase;
};

const unwrap = <T,>(result: { data: T; error: { message: string } | null }) => {
  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
};

// Labels are ciphertext in the database, so every read has to be unwrapped and
// every write sealed. A label that cannot be decrypted falls back to a
// placeholder rather than breaking the whole screen.
const readLabel = async (cipher: string, key: string, fallback: string) => {
  if (!cipher) {
    return fallback;
  }

  try {
    return (await decryptText(cipher, key)) || fallback;
  } catch {
    return fallback;
  }
};

// ---------------------------------------------------------------------------
// rooms
// ---------------------------------------------------------------------------

type CreateRoomInput = {
  ownerId: string;
  name: string;
  parentId?: string | null;
  expiry: ExpiryChoice;
  withStarterTab?: boolean;
};

export const createAccountRoom = async ({
  ownerId,
  name,
  parentId = null,
  expiry,
  withStarterTab = true
}: CreateRoomInput) => {
  const client = requireClient();
  const encryptionKey = createRoomKey();
  const encryptedName = await encryptText(name, encryptionKey);
  const expiresAt = expiryChoiceToTimestamp(expiry);

  for (let attempt = 0; attempt < MAX_ROOM_ID_ATTEMPTS; attempt += 1) {
    const roomId = createRoomId();
    const { error } = await client.from("rooms").insert({
      id: roomId,
      owner_id: ownerId,
      parent_id: parentId,
      encrypted_name: encryptedName,
      expires_at: expiresAt
    });

    if (error) {
      if (error.code === DUPLICATE_KEY) {
        continue;
      }

      throw new Error(error.message);
    }

    const keyResult = await client
      .from("room_keys")
      .insert({ room_id: roomId, encryption_key: encryptionKey });

    if (keyResult.error) {
      await client.from("rooms").delete().eq("id", roomId);
      throw new Error(keyResult.error.message);
    }

    if (withStarterTab) {
      await createTab(roomId, encryptionKey, "Tab 1", 0, starterSnippet);
    }

    return { roomId, encryptionKey };
  }

  throw new Error("Could not reserve a short room link. Try again.");
};

// A link-only room: no owner, no key row, 24 hours. The key exists solely in
// the URL fragment the creator shares, so the server never learns it.
export const createAnonymousRoom = async () => {
  const client = requireClient();
  const encryptionKey = createRoomKey();
  const expiresAt = new Date(Date.now() + ANONYMOUS_ROOM_LIFETIME_MS).toISOString();

  for (let attempt = 0; attempt < MAX_ROOM_ID_ATTEMPTS; attempt += 1) {
    const roomId = createRoomId();
    const { error } = await client
      .from("rooms")
      .insert({ id: roomId, expires_at: expiresAt });

    if (error) {
      if (error.code === DUPLICATE_KEY) {
        continue;
      }

      throw new Error(error.message);
    }

    await createTab(roomId, encryptionKey, "Tab 1", 0, starterSnippet);

    return { roomId, encryptionKey };
  }

  throw new Error("Could not reserve a short room link. Try again.");
};

export const loadWorkspaceRooms = async (): Promise<WorkspaceRoom[]> => {
  const client = requireClient();

  // room_keys is the precise list of rooms this account may open: its policy
  // is owner-or-team, while the rooms table itself stays readable by id so
  // that share links keep working for people without an account.
  const keyRows = unwrap(
    await client.from("room_keys").select("room_id, encryption_key")
  ) as { room_id: string; encryption_key: string }[];

  if (keyRows.length === 0) {
    return [];
  }

  const keyByRoom = new Map(keyRows.map((row) => [row.room_id, row.encryption_key]));
  const roomRows = unwrap(
    await client
      .from("rooms")
      .select("id, owner_id, parent_id, encrypted_name, expires_at, created_at")
      .in("id", Array.from(keyByRoom.keys()))
      .order("created_at", { ascending: true })
  ) as RoomRecord[];

  const rooms = await Promise.all(
    roomRows.map(async (row): Promise<WorkspaceRoom> => {
      const encryptionKey = keyByRoom.get(row.id) ?? "";

      return {
        id: row.id,
        ownerId: row.owner_id,
        parentId: row.parent_id,
        name: await readLabel(row.encrypted_name, encryptionKey, "Untitled room"),
        expiresAt: row.expires_at,
        expired: isExpired(row.expires_at),
        encryptionKey,
        children: []
      };
    })
  );

  const byId = new Map(rooms.map((room) => [room.id, room]));

  for (const room of rooms) {
    if (room.parentId) {
      byId.get(room.parentId)?.children.push(room);
    }
  }

  return rooms.filter((room) => !room.parentId || !byId.has(room.parentId));
};

export const loadRoomKey = async (roomId: string) => {
  const client = requireClient();
  const { data, error } = await client
    .from("room_keys")
    .select("encryption_key")
    .eq("room_id", roomId)
    .maybeSingle<{ encryption_key: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data?.encryption_key ?? null;
};

export const renameRoom = async (roomId: string, encryptionKey: string, name: string) => {
  const client = requireClient();
  const encryptedName = await encryptText(name, encryptionKey);
  const { error } = await client
    .from("rooms")
    .update({ encrypted_name: encryptedName })
    .eq("id", roomId);

  if (error) {
    throw new Error(error.message);
  }
};

export const setRoomExpiry = async (roomId: string, expiry: ExpiryChoice) => {
  const client = requireClient();
  const { error } = await client
    .from("rooms")
    .update({ expires_at: expiryChoiceToTimestamp(expiry) })
    .eq("id", roomId);

  if (error) {
    throw new Error(error.message);
  }
};

export const deleteRoom = async (roomId: string) => {
  const client = requireClient();
  const { error } = await client.from("rooms").delete().eq("id", roomId);

  if (error) {
    throw new Error(error.message);
  }
};

// ---------------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------------

export const loadTabs = async (roomId: string, encryptionKey: string) => {
  const client = requireClient();
  const rows = unwrap(
    await client
      .from("room_tabs")
      .select("id, room_id, encrypted_title, encrypted_content, position")
      .eq("room_id", roomId)
      .order("position", { ascending: true })
  ) as RoomTabRecord[];

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      roomId: row.room_id,
      title: await readLabel(row.encrypted_title, encryptionKey, `Tab ${row.position + 1}`),
      content: await decryptText(row.encrypted_content, encryptionKey),
      position: row.position
    }))
  );
};

export const createTab = async (
  roomId: string,
  encryptionKey: string,
  title: string,
  position: number,
  content = ""
): Promise<RoomTab> => {
  const client = requireClient();
  const row = unwrap(
    await client
      .from("room_tabs")
      .insert({
        room_id: roomId,
        encrypted_title: await encryptText(title, encryptionKey),
        encrypted_content: await encryptText(content, encryptionKey),
        position
      })
      .select("id, room_id, position")
      .single()
  ) as Pick<RoomTabRecord, "id" | "room_id" | "position">;

  return { id: row.id, roomId: row.room_id, title, content, position: row.position };
};

export const renameTab = async (tabId: string, encryptionKey: string, title: string) => {
  const client = requireClient();
  const { error } = await client
    .from("room_tabs")
    .update({ encrypted_title: await encryptText(title, encryptionKey) })
    .eq("id", tabId);

  if (error) {
    throw new Error(error.message);
  }
};

export const saveTabContent = async (
  tabId: string,
  encryptionKey: string,
  content: string
) => {
  const client = requireClient();
  const { error } = await client
    .from("room_tabs")
    .update({ encrypted_content: await encryptText(content, encryptionKey) })
    .eq("id", tabId);

  if (error) {
    throw new Error(error.message);
  }
};

export const deleteTab = async (tabId: string) => {
  const client = requireClient();
  const { error } = await client.from("room_tabs").delete().eq("id", tabId);

  if (error) {
    throw new Error(error.message);
  }
};

// ---------------------------------------------------------------------------
// teams
// ---------------------------------------------------------------------------

export const loadTeamOverview = async (
  userId: string,
  email: string
): Promise<TeamOverview> => {
  const client = requireClient();

  const teams = unwrap(
    await client.from("teams").select("id, owner_id, name")
  ) as TeamRecord[];
  const members = unwrap(
    await client.from("team_members").select("id, team_id, user_id, role, created_at")
  ) as TeamMemberRecord[];
  const invites = unwrap(
    await client
      .from("team_invites")
      .select("id, team_id, email, invited_by, status, created_at, responded_at")
      .order("created_at", { ascending: false })
  ) as TeamInviteRecord[];

  const ownTeam = teams.find((team) => team.owner_id === userId) ?? null;
  const peopleIds = new Set<string>([userId]);

  for (const member of members) {
    peopleIds.add(member.user_id);
  }

  for (const team of teams) {
    peopleIds.add(team.owner_id);
  }

  for (const invite of invites) {
    peopleIds.add(invite.invited_by);
  }

  const profiles = unwrap(
    await client.from("profiles").select("id, email, display_name").in("id", Array.from(peopleIds))
  ) as ProfileRecord[];
  const emailById = new Map(profiles.map((profile) => [profile.id, profile.email]));

  const normalizedEmail = email.trim().toLowerCase();

  return {
    teamId: ownTeam?.id ?? null,
    members: members
      .filter((member) => ownTeam && member.team_id === ownTeam.id)
      .map((member) => ({
        id: member.id,
        userId: member.user_id,
        email: emailById.get(member.user_id) ?? "Unknown member",
        role: member.role
      })),
    sentInvites: invites.filter(
      (invite) => ownTeam && invite.team_id === ownTeam.id && invite.status === "pending"
    ),
    receivedInvites: invites
      .filter(
        (invite) =>
          invite.status === "pending" && invite.email.toLowerCase() === normalizedEmail
      )
      .map((invite) => ({
        ...invite,
        fromEmail: emailById.get(invite.invited_by) ?? "A Code Share user",
        teamName: teams.find((team) => team.id === invite.team_id)?.name ?? "their team"
      })),
    joinedTeams: teams
      .filter((team) => team.owner_id !== userId)
      .map((team) => ({
        teamId: team.id,
        ownerEmail: emailById.get(team.owner_id) ?? "Unknown owner",
        name: team.name,
        membershipId:
          members.find(
            (member) => member.team_id === team.id && member.user_id === userId
          )?.id ?? null
      }))
  };
};

export const countPendingInvites = async (email: string) => {
  const client = requireClient();
  const { count, error } = await client
    .from("team_invites")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .ilike("email", email.trim().toLowerCase());

  if (error) {
    return 0;
  }

  return count ?? 0;
};

export const inviteTeamMember = async (email: string) => {
  const client = requireClient();
  const { error } = await client.rpc("invite_team_member", { p_email: email });

  if (error) {
    throw new Error(error.message);
  }
};

export const respondToInvite = async (inviteId: string, accept: boolean) => {
  const client = requireClient();
  const { error } = await client.rpc("respond_team_invite", {
    p_invite_id: inviteId,
    p_accept: accept
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const revokeInvite = async (inviteId: string) => {
  const client = requireClient();
  const { error } = await client.rpc("revoke_team_invite", { p_invite_id: inviteId });

  if (error) {
    throw new Error(error.message);
  }
};

export const removeTeamMember = async (memberId: string) => {
  const client = requireClient();
  const { error } = await client.from("team_members").delete().eq("id", memberId);

  if (error) {
    throw new Error(error.message);
  }
};

export const loadPendingDeletionRequest = async () => {
  const client = requireClient();
  const { data, error } = await client
    .from("account_deletion_requests")
    .select("id, created_at")
    .eq("status", "pending")
    .maybeSingle<{ id: string; created_at: string }>();

  if (error) {
    return null;
  }

  return data;
};

export const requestAccountDeletion = async (reason: string) => {
  const client = requireClient();
  const { error } = await client.rpc("request_account_deletion", { p_reason: reason });

  if (error) {
    throw new Error(error.message);
  }
};
