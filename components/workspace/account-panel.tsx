"use client";

import { useEffect, useState } from "react";
import { KeyRound, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";
import { loadPendingDeletionRequest, requestAccountDeletion } from "@/lib/workspace";

export function AccountPanel() {
  const { user, signOut, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<{ created_at: string } | null>(null);
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void loadPendingDeletionRequest().then(setPendingDeletion);
  }, []);

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (password !== confirmation) {
      setErrorMessage("Those two passwords do not match.");
      return;
    }

    setIsBusy(true);

    try {
      await updatePassword(password);
      setPassword("");
      setConfirmation("");
      setMessage("Password updated.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update the password.");
    } finally {
      setIsBusy(false);
    }
  };

  const askForDeletion = async () => {
    setIsBusy(true);
    setMessage("");
    setErrorMessage("");

    try {
      await requestAccountDeletion(reason);
      setPendingDeletion(await loadPendingDeletionRequest());
      setConfirmDeletion(false);
      setReason("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not send the request.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <Card title="Account" description="The email you signed in with.">
        <div className="rounded-2xl border border-[var(--border)] px-3 py-2 text-sm">
          {user?.email}
        </div>

        <Button
          variant="outline"
          type="button"
          className="mt-3 rounded-full"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </Card>

      <Card title="Change password" description="You stay signed in on this device.">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void changePassword(event)}>
          <Field label="New password">
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Repeat password">
            <Input
              type="password"
              required
              minLength={6}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isBusy}>
              <KeyRound className="size-4" />
              Update password
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Appearance" description="Applies to every room you open in this browser.">
        <ThemeToggle />
      </Card>

      <Card
        title="Delete this account"
        description="Deleting an account removes its rooms, tabs and team memberships. The request is recorded and completed by an operator, so tell us why if it helps."
      >
        {pendingDeletion ? (
          <p className="rounded-2xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
            A deletion request is already pending, sent on{" "}
            {new Date(pendingDeletion.created_at).toLocaleDateString()}.
          </p>
        ) : (
          <>
            <Field label="Reason (optional)">
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-[var(--input)] bg-[var(--card-strong)] px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                placeholder="Anything you want us to know"
              />
            </Field>

            <Button
              variant="outline"
              type="button"
              className="mt-3 rounded-full"
              disabled={isBusy}
              onClick={() => (confirmDeletion ? void askForDeletion() : setConfirmDeletion(true))}
              onBlur={() => setConfirmDeletion(false)}
            >
              <ShieldAlert className="size-4" />
              {confirmDeletion ? "Click again to confirm" : "Request account deletion"}
            </Button>
          </>
        )}
      </Card>

      {errorMessage ? (
        <p className="text-sm text-[var(--accent-strong)]">{errorMessage}</p>
      ) : null}
      {message ? <p className="text-sm text-[var(--muted)]">{message}</p> : null}
    </div>
  );
}

function Card({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)] backdrop-blur-xl">
      <h2 className="text-base font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-1 mb-4 text-sm leading-6 text-[var(--muted)]">{description}</p>
      {children}
    </section>
  );
}
