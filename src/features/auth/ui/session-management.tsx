"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { LogOut, Monitor, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/features/auth/client";

type AuthSession = NonNullable<
  Awaited<ReturnType<typeof authClient.listSessions>>["data"]
>[number];
type SessionListResult = Awaited<ReturnType<typeof authClient.listSessions>>;
type Problem = "loadFailed" | "reauthFailed" | "revokeFailed" | null;

function browserName(userAgent?: string | null) {
  if (!userAgent) return null;
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Chrome\//i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return null;
}

function formatDate(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SessionManagement() {
  const t = useTranslations("AccountSecurity");
  const locale = useLocale();
  const { data: currentSession } = authClient.useSession();
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AuthSession | null>(null);
  const [stepUpSessionId, setStepUpSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsReauthentication, setNeedsReauthentication] = useState(false);
  const [reauthenticating, setReauthenticating] = useState(false);
  const [password, setPassword] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);

  const applySessionList = useCallback((result: SessionListResult) => {
    if (result.error) {
      if (result.error.code === "SESSION_NOT_FRESH") {
        setNeedsReauthentication(true);
        setSessions([]);
        setProblem(null);
      } else {
        setNeedsReauthentication(false);
        setProblem("loadFailed");
      }
      return;
    }
    setSessions(result.data ?? []);
    setNeedsReauthentication(false);
    setProblem(null);
  }, []);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    try {
      applySessionList(await authClient.listSessions());
    } catch {
      setNeedsReauthentication(false);
      setProblem("loadFailed");
    } finally {
      setLoading(false);
    }
  }, [applySessionList]);

  useEffect(() => {
    let active = true;
    authClient
      .listSessions()
      .then((result) => {
        if (active) applySessionList(result);
      })
      .catch(() => {
        if (active) {
          setNeedsReauthentication(false);
          setProblem("loadFailed");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applySessionList]);

  async function reauthenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = currentSession?.user.email;
    if (!email || !password) {
      setProblem("reauthFailed");
      return;
    }

    setReauthenticating(true);
    setProblem(null);
    try {
      const result = await authClient.signIn.email({ email, password });
      setPassword("");
      if (result.error) {
        setProblem("reauthFailed");
        return;
      }
      const refreshedSession = await authClient.getSession();
      if (refreshedSession.error || !refreshedSession.data?.session.id) {
        setProblem("reauthFailed");
        return;
      }
      setStepUpSessionId(refreshedSession.data.session.id);
      await loadSessions();
    } catch {
      setPassword("");
      setProblem("reauthFailed");
    } finally {
      setReauthenticating(false);
    }
  }

  async function revokeSelectedSession() {
    if (!selectedSession) return;
    setRevoking(true);
    setProblem(null);
    try {
      const result = await authClient.revokeSession({
        token: selectedSession.token,
      });
      if (result.error) {
        if (result.error.code === "SESSION_NOT_FRESH") {
          setNeedsReauthentication(true);
          setSelectedSession(null);
        } else {
          setProblem("revokeFailed");
        }
        return;
      }
      setSessions((current) =>
        current.filter((session) => session.id !== selectedSession.id),
      );
      setSelectedSession(null);
      toast.success(t("revoked"));
    } catch {
      setProblem("revokeFailed");
    } finally {
      setRevoking(false);
    }
  }

  const currentSessionId = stepUpSessionId ?? currentSession?.session.id;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" />
            {t("sessionsTitle")}
          </CardTitle>
          <CardDescription>{t("sessionsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {problem && (
            <Alert variant="destructive">
              <AlertTitle>{t("errorTitle")}</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-2">
                {t(problem)}
                {problem === "loadFailed" && !needsReauthentication && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadSessions()}
                  >
                    {t("retry")}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner aria-hidden="true" />
              {t("loading")}
            </p>
          ) : needsReauthentication ? (
            <form onSubmit={reauthenticate}>
              <FieldGroup>
                <p className="text-sm text-muted-foreground">
                  {t("reauthDescription")}
                </p>
                <Field>
                  <FieldLabel htmlFor="session-password">
                    {t("password")}
                  </FieldLabel>
                  <Input
                    id="session-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </Field>
                <Button type="submit" disabled={reauthenticating}>
                  {reauthenticating && (
                    <Spinner data-icon="inline-start" aria-hidden="true" />
                  )}
                  {reauthenticating ? t("reauthenticating") : t("reauthenticate")}
                </Button>
              </FieldGroup>
            </form>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSessions")}</p>
          ) : (
            <>
              {!currentSessionId && (
                <Alert>
                  <AlertDescription>
                    {t("currentSessionUnavailable")}
                  </AlertDescription>
                </Alert>
              )}
              <ul className="flex flex-col divide-y">
                {sessions.map((session) => {
                  const isCurrent = session.id === currentSessionId;
                  const device =
                    browserName(session.userAgent) ?? t("unknownDevice");
                  return (
                    <li
                      key={session.id}
                      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <Monitor
                          className="mt-1 shrink-0"
                          aria-hidden="true"
                        />
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{device}</span>
                            {isCurrent && (
                              <Badge variant="secondary">
                                {t("currentSession")}
                              </Badge>
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {t("signedIn", {
                              date: formatDate(session.createdAt, locale),
                            })}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {t("expires", {
                              date: formatDate(session.expiresAt, locale),
                            })}
                          </span>
                          {isCurrent && (
                            <span className="text-sm text-muted-foreground">
                              {t("currentSessionHint")}
                            </span>
                          )}
                        </div>
                      </div>
                      {!isCurrent && currentSessionId && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={t("revokeFor", { device })}
                          onClick={() => setSelectedSession(session)}
                        >
                          <LogOut data-icon="inline-start" aria-hidden="true" />
                          {t("revoke")}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={selectedSession !== null}
        onOpenChange={(open) => {
          if (!open && !revoking) setSelectedSession(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDescription", {
                device: selectedSession
                  ? browserName(selectedSession.userAgent) ?? t("unknownDevice")
                  : t("unknownDevice"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={revoking}
              onClick={(event) => {
                event.preventDefault();
                void revokeSelectedSession();
              }}
            >
              {revoking && (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              )}
              {t("confirmRevoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
