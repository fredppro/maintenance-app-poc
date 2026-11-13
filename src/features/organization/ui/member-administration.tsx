"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { MailPlus } from "lucide-react";
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
type Confirmation = {
  message: string;
  action: () => Promise<void>;
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
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

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
    <div className="flex w-full min-w-0 flex-col gap-section">
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
                            setConfirmation({
                              message: t("confirmRoleChange", {
                                name: member.name,
                              }),
                              action: () =>
                                updateOrganizationMemberRole({
                                memberId: member.id,
                                role,
                                }),
                            });
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
                            setConfirmation({
                              message: t("confirmRemove", { name: member.name }),
                              action: () =>
                                removeOrganizationMember({ memberId: member.id }),
                            });
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
            <Empty size="sm">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MailPlus />
                </EmptyMedia>
                <EmptyTitle>{t("noInvitations")}</EmptyTitle>
                <EmptyDescription>{t("noInvitationsHint")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
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
                        date: new Intl.DateTimeFormat(locale, {
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
                      setConfirmation({
                        message: t("confirmRevoke", {
                          email: invitation.email,
                        }),
                        action: () =>
                          revokeOrganizationInvitation({
                            invitationId: invitation.id,
                          }),
                      });
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
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmActionTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                if (!confirmation) return;
                const action = confirmation.action;
                setConfirmation(null);
                void perform(action);
              }}
            >
              {pending && <Spinner data-icon="inline-start" />}
              {t("confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
