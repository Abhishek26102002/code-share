"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/lib/auth";

type Mode = "sign-in" | "sign-up";

export function AuthDialog({
  open,
  onClose,
  initialMode = "sign-in"
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const reset = () => {
    setPassword("");
    setMessage("");
    setErrorMessage("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setErrorMessage("");
    setMessage("");

    try {
      if (mode === "sign-in") {
        await signIn(email, password);
        onClose();
        reset();
        return;
      }

      const { needsEmailConfirmation } = await signUp(email, password, displayName);

      if (needsEmailConfirmation) {
        setMessage("Account created. Check your inbox to confirm the address, then sign in.");
        setMode("sign-in");
        setPassword("");
        return;
      }

      onClose();
      reset();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Modal
      title={mode === "sign-in" ? "Sign in" : "Create an account"}
      description="An account is optional. It keeps your rooms, tabs and team in one place instead of only in a link."
      open={open}
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        {mode === "sign-up" ? (
          <Field label="Display name">
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="How your team sees you"
              autoComplete="nickname"
            />
          </Field>
        ) : null}

        <Field label="Email">
          <Input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </Field>

        <Field label="Password" hint={mode === "sign-up" ? "At least 6 characters." : undefined}>
          <Input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          />
        </Field>

        {errorMessage ? (
          <p className="text-sm text-[var(--accent-strong)]">{errorMessage}</p>
        ) : null}
        {message ? <p className="text-sm text-[var(--muted)]">{message}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              reset();
            }}
            className="text-sm text-[var(--muted)] underline-offset-4 hover:underline"
          >
            {mode === "sign-in" ? "Create an account" : "I already have an account"}
          </button>

          <Button type="submit" disabled={isBusy}>
            {isBusy
              ? "Working..."
              : mode === "sign-in"
                ? "Sign in"
                : "Create account"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
