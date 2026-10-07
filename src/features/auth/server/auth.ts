import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import prisma from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { LEGACY_ORGANIZATION_SLUG } from "@/lib/tenant-constants";
import { sendTransactionalEmail } from "./email";
import { organizationAccess, organizationRoles } from "../shared/organization-access";
import {
  canAssignOrganizationRole,
  canManageOrganizationMember,
  isOrganizationManager,
} from "@/features/organization/shared/member-policy";

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;
const isProduction = process.env.NODE_ENV === "production";
const bootstrapEmail = process.env.PILOT_BOOTSTRAP_EMAIL?.trim().toLowerCase();

async function hasNoCustomerOrganizations() {
  return (
    (await prisma.organization.count({
      where: { slug: { not: LEGACY_ORGANIZATION_SLUG } },
    })) === 0
  );
}

async function requireOrganizationManagerRole(
  organizationId: string,
  userId: string,
) {
  const membership = await prisma.member.findFirst({
    where: { organizationId, userId },
    select: { role: true },
  });
  if (!membership || !isOrganizationManager(membership.role)) {
    throw new APIError("FORBIDDEN", {
      message: "Only an organization owner or admin can manage members",
    });
  }
  return membership.role;
}

if (!secret || secret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
}

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL is missing");
}

const authOrigin = new URL(baseURL);
if (
  !["http:", "https:"].includes(authOrigin.protocol) ||
  (isProduction &&
    authOrigin.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(authOrigin.hostname))
) {
  throw new Error("BETTER_AUTH_URL must be an explicit HTTPS application URL");
}

export const auth = betterAuth({
  appName: "Maintenance Scheduler",
  baseURL,
  secret,
  trustedOrigins: [authOrigin.origin],
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path !== "/organization/invite-member") return;

      if (!context.headers) {
        throw new APIError("UNAUTHORIZED", {
          message: "Authentication is required to invite organization members",
        });
      }
      const requestedRoles: string[] = Array.isArray(context.body.role)
        ? context.body.role
        : [context.body.role];
      const session = await auth.api.getSession({
        headers: context.headers,
      });
      if (!session) {
        throw new APIError("UNAUTHORIZED", {
          message: "Authentication is required to invite organization members",
        });
      }

      const organizationId =
        context.body.organizationId ??
        session.session.activeOrganizationId;
      if (!organizationId) {
        throw new APIError("FORBIDDEN", {
          message: "An active organization is required to invite members",
        });
      }
      const actorRole = await requireOrganizationManagerRole(
        organizationId,
        session.user.id,
      );
      if (
        !requestedRoles.every((role) =>
          canAssignOrganizationRole(actorRole, role),
        )
      ) {
        throw new APIError("FORBIDDEN", {
          message: "You cannot invite a member with this role",
        });
      }
    }),
  },
  advanced: {
    useSecureCookies: isProduction,
  },
  rateLimit: {
    enabled: isProduction,
    storage: isProduction ? "database" : "memory",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
    },
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: isProduction,
    sendResetPassword: async ({ user, url }) =>
      sendTransactionalEmail({
        to: user.email,
        subject: "Reset your Maintenance Scheduler password",
        text: "Use this link to reset your password.",
        url,
      }),
  },
  emailVerification: {
    sendOnSignUp: isProduction,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) =>
      sendTransactionalEmail({
        to: user.email,
        subject: "Verify your Maintenance Scheduler email",
        text: "Verify your email address to access your account.",
        url,
      }),
  },
  databaseHooks: {
    session: {
      create: {
        // Sign-ins are recorded in every organization the user belongs to; no IP or user agent is copied.
        after: async (session) => {
          const memberships = await prisma.member.findMany({
            where: { userId: session.userId },
            select: { organizationId: true },
          });
          await Promise.all(
            memberships.map(({ organizationId }) =>
              recordAuditEvent({
                organizationId,
                actorUserId: session.userId,
                action: "auth.sign_in",
                subjectType: "user",
                subjectId: session.userId,
              }),
            ),
          );
        },
      },
    },
    user: {
      create: {
        before: async (user) => {
          if (!isProduction) return { data: user };

          const email = user.email.trim().toLowerCase();
          if (
            bootstrapEmail &&
            email === bootstrapEmail &&
            (await hasNoCustomerOrganizations())
          ) {
            return { data: user };
          }

          const pendingInvitation = await prisma.invitation.findFirst({
            where: {
              email,
              status: "pending",
              expiresAt: { gt: new Date() },
            },
            select: { id: true },
          });

          return pendingInvitation ? { data: user } : false;
        },
      },
    },
  },
  plugins: [
    organization({
      ac: organizationAccess,
      roles: organizationRoles,
      organizationHooks: {
        beforeCreateInvitation: async ({ invitation, inviter }) => {
          const actorRole = await requireOrganizationManagerRole(
            invitation.organizationId,
            inviter.id,
          );
          if (!canAssignOrganizationRole(actorRole, invitation.role)) {
            throw new APIError("FORBIDDEN", {
              message: "You cannot invite a member with this role",
            });
          }
        },
        afterCreateInvitation: async ({ invitation, inviter, organization }) => {
          await prisma.organizationAuditEvent.create({
            data: {
              organizationId: organization.id,
              actorUserId: inviter.id,
              action: "invitation.created",
              subjectType: "invitation",
              subjectId: invitation.id,
              details: { email: invitation.email, role: invitation.role },
            },
          });
        },
        beforeCancelInvitation: async ({
          invitation,
          cancelledBy,
          organization,
        }) => {
          const actorRole = await requireOrganizationManagerRole(
            organization.id,
            cancelledBy.id,
          );
          if (
            !canManageOrganizationMember(
              actorRole,
              invitation.role ?? "member",
            )
          ) {
            throw new APIError("FORBIDDEN", {
              message: "You cannot revoke this organization invitation",
            });
          }
        },
        afterCancelInvitation: async ({
          invitation,
          cancelledBy,
          organization,
        }) => {
          await prisma.organizationAuditEvent.create({
            data: {
              organizationId: organization.id,
              actorUserId: cancelledBy.id,
              action: "invitation.canceled",
              subjectType: "invitation",
              subjectId: invitation.id,
              details: { email: invitation.email, role: invitation.role },
            },
          });
        },
      },
      allowUserToCreateOrganization: async (user) => {
        if (!isProduction) return true;
        return Boolean(
          bootstrapEmail &&
            user.email.trim().toLowerCase() === bootstrapEmail &&
          (await hasNoCustomerOrganizations()),
        );
      },
      requireEmailVerificationOnInvitation: isProduction,
      sendInvitationEmail: async ({ id, email, organization: invitedOrg }) => {
        const invitationUrl = new URL("/en/accept-invitation", authOrigin);
        invitationUrl.searchParams.set("id", id);

        await sendTransactionalEmail({
          to: email,
          subject: `Invitation to ${invitedOrg.name}`,
          text: `You have been invited to join ${invitedOrg.name}.`,
          url: invitationUrl.toString(),
        });
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
