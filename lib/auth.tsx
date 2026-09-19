"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Supabase returns errors, not exceptions. Everything in this file throws
// instead, so screens can keep a single try/catch per action.
const throwOnError = (error: { message: string } | null) => {
  if (error) {
    throw new Error(error.message);
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false);
      return;
    }

    const client = supabase;
    let active = true;

    void client.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      setSession(data.session);
      setIsLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const requireClient = useCallback(() => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured yet.");
    }

    return supabase;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const client = requireClient();
      const { error } = await client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });
      throwOnError(error);
    },
    [requireClient]
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const client = requireClient();
      const { data, error } = await client.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: displayName ? { data: { display_name: displayName } } : undefined
      });
      throwOnError(error);

      // With email confirmation turned on Supabase creates the user but hands
      // back no session, and the person has to click the link first.
      return { needsEmailConfirmation: Boolean(data.user) && !data.session };
    },
    [requireClient]
  );

  const signOut = useCallback(async () => {
    const client = requireClient();
    throwOnError(await client.auth.signOut().then((result) => result.error));
    setSession(null);
  }, [requireClient]);

  const updatePassword = useCallback(
    async (password: string) => {
      const client = requireClient();
      const { error } = await client.auth.updateUser({ password });
      throwOnError(error);
    },
    [requireClient]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      isLoading,
      signIn,
      signUp,
      signOut,
      updatePassword
    }),
    [isLoading, session, signIn, signOut, signUp, updatePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }

  return context;
}
