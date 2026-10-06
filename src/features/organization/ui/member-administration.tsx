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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>{t("inviteTitle")}</CardTitle>
          <CardDescription>{t("inviteDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={invite}>
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
                <Select name="role" defaultValue="read_only">
                  <SelectTrigger id="member-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="read_only">{t("readOnly")}</SelectItem>
                      <SelectItem value="maintenance_manager">
                        {t("maintenanceManager")}
                      </SelectItem>
                      <SelectItem value="admin">{t("admin")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                {t("sendInvitation")}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card variant="technical">
        <CardHeader>
          <CardTitle>{t("membersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {members.map((member) => {
              const manageable = mayManage(member);
              const currentRole: ManagedRole =
                member.role === "admin" || member.role === "maintenance_manager"
                  ? member.role
                  : "read_only";
              return (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span>
                    <span className="block font-medium">{member.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {member.email}
                    </span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {manageable ? (
                      <>
                        <label
                          className="sr-only"
                          htmlFor={`role-${member.id}`}
                        >
                          {t("roleFor", { name: member.name })}
                        </label>
                        <Select
                          value={currentRole}
                          disabled={pending}
                          onValueChange={(value) => {
                            const role = value as ManagedRole;
                            if (
                              !window.confirm(
                                t("confirmRoleChange", { name: member.name }),
                              )
                            ) {
                              return;
                            }
                            void perform(() =>
                              updateOrganizationMemberRole({
                                memberId: member.id,
                                role,
                              }),
                            );
                          }}
                        >
                          <SelectTrigger
                            id={`role-${member.id}`}
                            aria-label={t("roleFor", { name: member.name })}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="read_only">
                                {t("readOnly")}
                              </SelectItem>
                              <SelectItem value="maintenance_manager">
                                {t("maintenanceManager")}
                              </SelectItem>
                              {actorRole === "owner" && (
                                <SelectItem value="admin">{t("admin")}</SelectItem>
                              )}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            if (
                              window.confirm(
                                t("confirmRemove", { name: member.name }),
                              )
                            ) {
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("invitationsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noInvitations")}</p>
          ) : (
            <ul className="flex flex-col divide-y">
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
                      if (
                        window.confirm(
                          t("confirmRevoke", { email: invitation.email }),
                        )
                      ) {
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
        </CardContent>
      </Card>
    </div>
  );
}
