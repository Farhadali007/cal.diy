/**
 * First-admin provisioning for VOICERO Calendar (Cal.diy fork).
 *
 * Why this exists: the web setup wizard (`POST /api/auth/setup`) only runs
 * when zero users exist, and the dev install already holds test users — so
 * the wizard can never provision the real platform admin. This is the
 * one-time CLI path (founder decision, 2026-11-23): it creates the first
 * CLI-provisioned admin and returns a single-use password-setup URL.
 *
 * No password is ever generated, shown, or stored here: the admin sets
 * their own password through the standard reset flow, and the link expires
 * on use (and after 6 hours). "Forces change on first login" is satisfied
 * by construction — the account has no usable password until the operator
 * sets one through the single-use link.
 *
 * One-time enforcement: the created user carries a metadata marker, and
 * the service refuses to run again once any user carries it. The gate is
 * deliberately about CLI provisioning, not about user count — test users
 * and fixture admins do not block it, and it cannot create a second admin.
 *
 * Self-contained by design: it imports only `@prisma/client` and node
 * built-ins, so the compiled script runs inside the web container against
 * the container's own Prisma client without the app's build.
 */

import type { PrismaClient } from "@prisma/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

function validateInput(input: CreateFirstAdminInput): void {
  if (!EMAIL_RE.test(input.email)) {
    throw new Error(`Invalid email address: ${input.email}`);
  }
  if (input.name.length < 3) {
    throw new Error("Name must be at least 3 characters long.");
  }
  if (!USERNAME_RE.test(input.username)) {
    throw new Error(
      `Invalid username: ${input.username} (lowercase letters, digits and hyphens only, must start and end with a letter or digit).`
    );
  }
  if (!/^https?:\/\/.+/.test(input.webappUrl)) {
    throw new Error(`Invalid webapp URL: ${input.webappUrl}`);
  }
}

/** Metadata marker proving a user was created by this CLI. */
export const FIRST_ADMIN_MARKER = "voicero-first-admin-cli";

/** Must match PASSWORD_RESET_EXPIRY_HOURS in passwordResetRequest.ts. */
export const FIRST_ADMIN_SETUP_EXPIRY_HOURS = 6;

export type CreateFirstAdminInput = {
  email: string;
  name: string;
  username: string;
  webappUrl: string;
};

export type CreateFirstAdminResult = {
  userId: number;
  email: string;
  username: string;
  setupUrl: string;
  expiresAt: Date;
};

export async function createFirstAdmin(
  prisma: PrismaClient,
  input: CreateFirstAdminInput
): Promise<CreateFirstAdminResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const username = input.username.trim();
  const webappUrl = input.webappUrl.replace(/\/$/, "");

  validateInput({ email, name, username, webappUrl });

  const alreadyProvisioned = await prisma.user.findFirst({
    where: { metadata: { path: ["provisionedBy"], equals: FIRST_ADMIN_MARKER } },
    select: { id: true },
  });
  if (alreadyProvisioned) {
    throw new Error(
      `First admin already provisioned (user id ${alreadyProvisioned.id}). This command runs exactly once per installation.`
    );
  }

  const emailTaken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (emailTaken) {
    throw new Error(`A user with email ${email} already exists (user id ${emailTaken.id}).`);
  }

  const usernameTaken = await prisma.user.findFirst({
    where: { username, organizationId: null },
    select: { id: true },
  });
  if (usernameTaken) {
    throw new Error(`Username ${username} is already taken (user id ${usernameTaken.id}).`);
  }

  // Mirror createPasswordReset: expire any unexpired reset requests for the email first.
  await prisma.resetPasswordRequest.updateMany({
    where: { email, expires: { gt: new Date() } },
    data: { expires: new Date() },
  });

  // Same fields as POST /api/auth/setup, minus the password: the admin sets
  // it through the single-use setup link below.
  const user = await prisma.user.create({
    data: {
      username,
      email,
      role: "ADMIN",
      name,
      emailVerified: new Date(),
      locale: "en",
      // String literals, not enum imports: with the custom generate output
      // path the `@prisma/client` entry does not re-export enum values
      // (verified in the container and the sandbox). These are the enum
      // member values (IdentityProvider.CAL, CreationSource.WEBAPP).
      identityProvider: "CAL",
      creationSource: "WEBAPP",
      metadata: { provisionedBy: FIRST_ADMIN_MARKER, provisionedAt: new Date().toISOString() },
    },
    select: { id: true },
  });

  const expiresAt = new Date(Date.now() + FIRST_ADMIN_SETUP_EXPIRY_HOURS * 60 * 60 * 1000);
  const request = await prisma.resetPasswordRequest.create({
    data: { email, expires: expiresAt },
    select: { id: true },
  });

  return {
    userId: user.id,
    email,
    username,
    setupUrl: `${webappUrl}/auth/forgot-password/${request.id}`,
    expiresAt,
  };
}
