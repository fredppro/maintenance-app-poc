"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  inviteOrganizationMember,
  removeOrganizationMember,
  revokeOrganizationInvitation,
  updateOrganizationMemberRole,
} from "@/features/organization/server/member-actions";

type ManagedRole = "admin" | "maintenance_manager" | "read_only";
type Member = { id: string; name: string; email: string; role: string };
type PendingInvitation = {
  id: string;
  email: string;
  role: string | null;
  expiresAt: Date;
};

export function MemberAdministration({
  members,
  invitations,
  actorId,
  actorRole,
}: {
  members: Member[];
  invitations: PendingInvitation[];
  actorId: string;
  actorRole: string;
}) {
  const t = useTranslations("Members");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function perform(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch {
      setError(t("managementError"));
    } finally {
      setPending(false);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await perform(async () => {
      await inviteOrganizationMember({
        email: String(form.get("email")).trim(),
        role: String(form.get("role")),
      });
      formElement.reset();
    });
  }

  function mayManage(member: Member) {
    if (member.id === actorId || member.role === "owner") return false;
    if (actorRole === "owner") return true;
    return actorRole === "admin" && member.role !== "admin";
  }

  function displayRole(role: string) {
    return t(
      role === "owner" ||
        role === "admin" ||
        role === "maintenance_manager" ||
        role === "read_only"
        ? role
        : "member",
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-8">
      {error && <FieldError role="alert">{error}</FieldError>}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">{t("inviteTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("inviteDescription")}</p>
        <form className="mt-4" onSubmit={invite}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="member-email">{t("email")}</FieldLabel>
              <Input
                id="member-email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="member-role">{t("role")}</FieldLabel>
              <select
                id="member-role"
                name="role"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue="read_only"
              >
                <option value="read_only">{t("readOnly")}</option>
                <option value="maintenance_manager">{t("maintenanceManager")}</option>
                <option value="admin">{t("admin")}</option>
              </select>
            </Field>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {t("sendInvitation")}
            </Button>
          </FieldGroup>
        </form>
      </section>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">{t("membersTitle")}</h2>
        <ul className="mt-4 flex flex-col divide-y">
          {members.map((member) => {
            const manageable = mayManage(member);
            const currentRole: ManagedRole =
              member.role === "admin" || member.role === "maintenance_manager"
                ? member.role
                : "read_only";
            return (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="block font-medium">{member.name}</span>
                  <span className="text-sm text-muted-foreground">{member.email}</span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {manageable ? (
                    <>
                      <label className="sr-only" htmlFor={`role-${member.id}`}>
                        {t("roleFor", { name: member.name })}
                      </label>
                      <select
                        id={`role-${member.id}`}
                        aria-label={t("roleFor", { name: member.name })}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={currentRole}
                        disabled={pending}
                        onChange={(event) => {
                          const role = event.target.value as ManagedRole;
                          if (!window.confirm(t("confirmRoleChange", { name: member.name }))) {
                            event.target.value = currentRole;
                            return;
                          }
                          void perform(() =>
                            updateOrganizationMemberRole({ memberId: member.id, role }),
                          );
                        }}
                      >
                        <option value="read_only">{t("readOnly")}</option>
                        <option value="maintenance_manager">{t("maintenanceManager")}</option>
                        {actorRole === "owner" && (
                          <option value="admin">{t("admin")}</option>
                        )}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(t("confirmRemove", { name: member.name }))) {
                            void perform(() =>
                              removeOrganizationMember({ memberId: member.id }),
                            );
                          }
                        }}
                      >
                        {pending && <Spinner data-icon="inline-start" />}
                        {t("remove")}
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {displayRole(member.role)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">{t("invitationsTitle")}</h2>
        {invitations.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("noInvitations")}</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span>
                  <span className="block font-medium">{invitation.email}</span>
                  <span className="text-sm text-muted-foreground">
                    {displayRole(invitation.role ?? "member")} ·{" "}
                    {t("expires", {
                      date: new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                      }).format(invitation.expiresAt),
                    })}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(t("confirmRevoke", { email: invitation.email }))) {
                      void perform(() =>
                        revokeOrganizationInvitation({
                          invitationId: invitation.id,
                        }),
                      );
                    }
                  }}
                >
                  {pending && <Spinner data-icon="inline-start" />}
                  {t("revoke")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
