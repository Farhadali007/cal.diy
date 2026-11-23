/**
 * One-time first-admin provisioning CLI (VOICERO Calendar).
 *
 * Creates the platform admin account and prints a single-use password-setup
 * URL. No password is generated, shown, or stored: the admin sets their own
 * password through the link, which expires on use (and after 6 hours).
 *
 * Usage:
 *   npx tsx apps/web/scripts/create-first-admin.ts \
 *     --email admin@voicero.io --name "VOICERO Admin" --username voicero-admin \
 *     [--webapp-url http://127.0.0.1:3300] [--quiet]
 *
 * --webapp-url defaults to $NEXT_PUBLIC_WEBAPP_URL. --quiet prints only
 * `SETUP_URL=<url>` (for scripted use; the URL is a credential-equivalent
 * for 6 hours — never log it). Requires $DATABASE_URL.
 *
 * Full documentation: docs/FIRST-ADMIN-CLI.md
 */

import process from "node:process";
import { PrismaClient } from "@prisma/client";
import { createFirstAdmin } from "../../../packages/features/auth/lib/createFirstAdmin";

type CliArgs = {
  email: string;
  name: string;
  username: string;
  webappUrl: string;
  quiet: boolean;
};

const USAGE = `Usage: create-first-admin --email <email> --name <name> --username <slug> [--webapp-url <url>] [--quiet]
  --email       Admin email address (required)
  --name        Admin full name, at least 3 characters (required)
  --username    Admin username slug: lowercase letters, digits, hyphens (required)
  --webapp-url  Public web app URL (defaults to $NEXT_PUBLIC_WEBAPP_URL)
  --quiet       Print only SETUP_URL=<url> (for scripted use)
  --help        Show this help`;

function fail(message: string, code: 1 | 2): never {
  console.error(`ERROR: ${message}`);
  process.exit(code);
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  let quiet = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    if (arg === "--quiet") {
      quiet = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        fail(`Missing value for ${arg}\n${USAGE}`, 2);
      }
      args[key] = value;
      i++;
      continue;
    }
    fail(`Unexpected argument: ${arg}\n${USAGE}`, 2);
  }

  const webappUrl = args["webapp-url"] ?? process.env.NEXT_PUBLIC_WEBAPP_URL ?? "";
  if (!args.email || !args.name || !args.username) {
    fail(`--email, --name and --username are all required.\n${USAGE}`, 2);
  }
  if (!webappUrl) {
    fail("--webapp-url is required (or set $NEXT_PUBLIC_WEBAPP_URL).", 2);
  }

  return { email: args.email, name: args.name, username: args.username, webappUrl, quiet };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const result = await createFirstAdmin(prisma, args);
    if (args.quiet) {
      console.log(`SETUP_URL=${result.setupUrl}`);
      return;
    }
    console.log("First admin created successfully.");
    console.log(`  user id:  ${result.userId}`);
    console.log(`  email:    ${result.email}`);
    console.log(`  username: ${result.username}`);
    console.log(`  role:     ADMIN`);
    console.log("");
    console.log("Single-use password-setup link (expires on use, and at");
    console.log(`  ${result.expiresAt.toISOString()}):`);
    console.log(`  ${result.setupUrl}`);
    console.log("");
    console.log("Open the link and set the admin password. No password exists");
    console.log("until then, and this command cannot be run again.");
  } catch (error) {
    if (error instanceof Error) {
      fail(error.message, 1);
    }
    fail(String(error), 1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
