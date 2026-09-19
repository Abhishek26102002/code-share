import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "code-share-auth"
      }
    })
  : null;

export type RoomRecord = {
  id: string;
  owner_id: string | null;
  parent_id: string | null;
  encrypted_name: string;
  expires_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type RoomTabRecord = {
  id: string;
  room_id: string;
  encrypted_title: string;
  encrypted_content: string;
  position: number;
  created_at?: string;
  updated_at?: string;
};

export type RoomKeyRecord = {
  room_id: string;
  encryption_key: string;
};

export type ProfileRecord = {
  id: string;
  email: string;
  display_name: string | null;
};

export type TeamRecord = {
  id: string;
  owner_id: string;
  name: string;
};

export type TeamMemberRecord = {
  id: string;
  team_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
};

export type TeamInviteRecord = {
  id: string;
  team_id: string;
  email: string;
  invited_by: string;
  status: "pending" | "accepted" | "rejected" | "revoked";
  created_at: string;
  responded_at: string | null;
};
