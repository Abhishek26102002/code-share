"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, LogOut, Mail, UserMinus, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import {
  inviteTeamMember,
  loadTeamOverview,
  removeTeamMember,
  respondToInvite,
  revokeInvite,
  type TeamOverview
} from "@/lib/workspace";

type TeamsPanelProps = {
  userId: string;
  email: string;
  /** Called after anything that changes which rooms this account can open. */
  onMembershipChange: () => void;
};

export function TeamsPanel({ userId, email, onMembershipChange }: TeamsPanelProps) {
  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      setOverview(await loadTeamOverview(userId, email));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load your team.");
    }
  }, [email, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>, successMessage?: string) => {
    setIsBusy(true);
    setErrorMessage("");
    setMessage("");

    try {
      await action();

      if (successMessage) {
        setMessage(successMessage);
      }

      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  };

  const sendInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    const target = inviteEmail.trim();

    if (!target) {
      return;
    }

    await run(async () => {
      await inviteTeamMember(target);
      setInviteEmail("");
    }, `Invite sent to ${target}. They will see it in their Teams tab.`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <Card
        title="Invitations for you"
        description="Accepting an invite gives you access to every room and tab that person owns."
      >
        {overview && overview.receivedInvites.length > 0 ? (
          <ul className="space-y-2">
            {overview.receivedInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-3 py-2"
              >
                <span className="text-sm">
                  <strong className="font-medium">{invite.fromEmail}</strong> invited you to{" "}
                  {invite.teamName}
                </span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    type="button"
                    className="rounded-full"
                    disabled={isBusy}
                    onClick={() =>
                      void run(async () => {
                        await respondToInvite(invite.id, true);
                        onMembershipChange();
                      }, "You joined the team.")
                    }
                  >
                    <Check className="size-4" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    className="rounded-full"
                    disabled={isBusy}
                    onClick={() =>
                      void run(async () => {
                        await respondToInvite(invite.id, false);
                      }, "Invite declined.")
                    }
                  >
                    <X className="size-4" />
                    Reject
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">No invitations waiting for you.</p>
        )}
      </Card>

      <Card
        title="Your team"
        description="Everyone here can open every room you own, including all of their tabs."
      >
        <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(event) => void sendInvite(event)}>
          <div className="min-w-56 flex-1">
            <Field label="Invite by email">
              <Input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="teammate@example.com"
              />
            </Field>
          </div>
          <Button type="submit" disabled={isBusy} className="h-11">
            <UserPlus className="size-4" />
            Send invite
          </Button>
        </form>

        <ul className="space-y-2">
          {overview?.members.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <Mail className="size-4 text-[var(--muted)]" />
                {member.email}
                <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                  {member.role}
                </span>
              </span>

              {member.role !== "owner" ? (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  className="rounded-full"
                  disabled={isBusy}
                  onClick={() =>
                    void run(async () => {
                      await removeTeamMember(member.id);
                    }, "Member removed.")
                  }
                >
                  <UserMinus className="size-4" />
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>

        {overview && overview.sentInvites.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {overview.sentInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]"
              >
                <span>{invite.email} — waiting for a reply</span>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  className="rounded-full"
                  disabled={isBusy}
                  onClick={() =>
                    void run(async () => {
                      await revokeInvite(invite.id);
                    }, "Invite withdrawn.")
                  }
                >
                  <X className="size-4" />
                  Withdraw
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card
        title="Teams you joined"
        description="Rooms shared with you show up under Shared with you in the sidebar."
      >
        {overview && overview.joinedTeams.length > 0 ? (
          <ul className="space-y-2">
            {overview.joinedTeams.map((team) => (
              <li
                key={team.teamId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-3 py-2 text-sm"
              >
                <span>
                  {team.name} — owned by {team.ownerEmail}
                </span>
                {team.membershipId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    className="rounded-full"
                    disabled={isBusy}
                    onClick={() =>
                      void run(async () => {
                        await removeTeamMember(team.membershipId as string);
                        onMembershipChange();
                      }, "You left the team.")
                    }
                  >
                    <LogOut className="size-4" />
                    Leave
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">You have not joined another team yet.</p>
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
