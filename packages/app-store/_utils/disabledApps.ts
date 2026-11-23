/**
 * VOICERO app-store disable list (task 4.7).
 *
 * Founder decision 2026-11-23: prefer DISABLING unused integrations over
 * destructively removing working upstream code. No app code is deleted;
 * disabled apps stay in the repo and in the generated metadata, and can be
 * re-enabled by configuration alone (see VOICERO_ENABLE_DISABLED_APPS).
 *
 * What "disabled" means:
 * - The app never appears in the app catalog listings or its /apps/[slug]
 *   page (enforced in _appRegistry.getAppWithMetadata).
 * - The app cannot be installed (enforced on the `add` endpoint in
 *   apps/web/pages/api/integrations/[...args].ts, and on the admin toggle
 *   in packages/trpc/server/routers/viewer/apps/toggle.handler.ts).
 * - The app seeds/syncs with enabled=false in the DB (seed-app-store.ts
 *   and the syncAppMeta cron), so DB state stays coherent with policy.
 *
 * What it deliberately does NOT do: it does not delete credentials, break
 * existing bookings, or remove location types. An app disabled after users
 * connected it keeps working for those users until they disconnect it.
 * Disabling is a policy gate on listing + new installs, not data loss.
 *
 * Kept enabled (8 apps — the VOICERO Calendar integration scope):
 * - google-calendar, office365-calendar — calendars (task 3.4 precedence:
 *   businesses connect Google/Outlook calendars)
 * - ics-feed — ICS feed import
 * - daily-video — Cal Video (Daily.co); the keep-vs-replace decision is
 *   STILL OPEN with the founder, so it stays enabled here
 * - google-meet, msteams, zoom — mainstream conferencing
 * - stripe — paid bookings (live feature; see docs/EE-DEBRIS-AUDIT.md §6)
 *
 * Everything else in the catalog (98 apps) is disabled by default.
 * Re-enable candidates if the product needs them later: jitsi (self-hosted
 * conferencing fallback), caldav-calendar (generic CalDAV), zapier / make
 * (automation). Re-enabling is one env line, no code change.
 *
 * Configuration (all optional; read lazily on every call so tests can
 * change them without re-importing):
 * - VOICERO_DISABLED_APPS — comma-separated extra slugs/dirNames to
 *   disable, added to the default list below.
 * - VOICERO_ENABLE_DISABLED_APPS — comma-separated slugs/dirNames to
 *   re-enable. Wins over both the default list and VOICERO_DISABLED_APPS.
 *
 * This module has no imports on purpose: it is used by server code
 * (_appRegistry, API routes, tRPC handlers, scripts) and must never pull
 * in the app metadata graph (circular-import risk).
 */

// Canonical identifiers are slugs. DirNames that differ from the slug are
// resolved through DIRNAME_TO_SLUG so callers can pass either form.
const DEFAULT_DISABLED_APP_SLUGS: readonly string[] = [
  "alby",
  "amie",
  "apple-calendar",
  "attio",
  "autocheckin",
  "baa-for-hipaa",
  "basecamp3",
  "bolna",
  "btcpayserver",
  "caldav-calendar",
  "campfire",
  "caretta",
  "chatbase",
  "clara",
  "clic",
  "closecom",
  "cron",
  "databuddy",
  "deel",
  "demodesk",
  "dialpad",
  "discord",
  "dub",
  "eightxeight",
  "element-call",
  "elevenlabs",
  "exchange",
  "exchange2013-calendar",
  "exchange2016-calendar",
  "facetime",
  "famulor",
  "fathom",
  "feishu-calendar",
  "fonio-ai",
  "framer",
  "ga4",
  "giphy",
  "granola",
  "greetmate-ai",
  "gtm",
  "hitpay",
  "horizon-workrooms",
  "hubspot",
  "huddle01",
  "insihts",
  "intercom",
  "jelly",
  "jitsi",
  "lark-calendar",
  "lindy",
  "linear",
  "lyra",
  "make",
  "matomo",
  "metapixel",
  "millis-ai",
  "mirotalk",
  "mock-payment-app",
  "monobot",
  "n8n",
  "nextcloudtalk",
  "paypal",
  "ping",
  "pipedream",
  "pipedrive-crm",
  "plausible",
  "posthog",
  "qr_code",
  "raycast",
  "retell-ai",
  "riverside",
  "roam",
  "salesforce",
  "salesroom",
  "sendgrid",
  "shimmervideo",
  "signal",
  "sirius_video",
  "skype",
  "sylapsvideo",
  "synthflow",
  "tandem",
  "telegram",
  "telli",
  "twipla",
  "umami",
  "vimcal",
  "vital-automation",
  "weather_in_your_calendar",
  "webex",
  "whatsapp",
  "whereby",
  "wipe-my-cal",
  "wordpress",
  "zapier",
  "zoho-bigin",
  "zohocalendar",
  "zohocrm",
];

// Every dirName in the catalog that differs from its app's slug
// (packages/app-store/*/config.json + */_metadata.ts, 2026-11-23).
// Covers both disabled and kept apps so env overrides can use either form.
const DIRNAME_TO_SLUG: Readonly<Record<string, string>> = {
  applecalendar: "apple-calendar",
  caldavcalendar: "caldav-calendar",
  dailyvideo: "daily-video",
  exchange2013calendar: "exchange2013-calendar",
  exchange2016calendar: "exchange2016-calendar",
  exchangecalendar: "exchange",
  feishucalendar: "feishu-calendar",
  googlecalendar: "google-calendar",
  googlevideo: "google-meet",
  huddle01video: "huddle01",
  "ics-feedcalendar": "ics-feed",
  jitsivideo: "jitsi",
  larkcalendar: "lark-calendar",
  office365calendar: "office365-calendar",
  office365video: "msteams",
  stripepayment: "stripe",
  tandemvideo: "tandem",
  vital: "vital-automation",
  wipemycalother: "wipe-my-cal",
  zoomvideo: "zoom",
};

function readEnv(name: string): string | undefined {
  // process is unavailable in some runtimes; default to unset there.
  const env = globalThis.process?.env;
  return env?.[name];
}

function parseEnvList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

/** Resolve a slug or dirName to its canonical slug. */
function resolveSlug(slugOrDirName: string): string {
  const normalized = normalizeIdentifier(slugOrDirName);
  return DIRNAME_TO_SLUG[normalized] ?? normalized;
}

/**
 * The effective disabled set as canonical slugs: default list, plus
 * VOICERO_DISABLED_APPS extras, minus VOICERO_ENABLE_DISABLED_APPS
 * re-enables. Sorted for stable logging / debugging.
 */
export function getDisabledAppSlugs(): string[] {
  const disabled = new Set<string>(DEFAULT_DISABLED_APP_SLUGS);
  for (const extra of parseEnvList(readEnv("VOICERO_DISABLED_APPS"))) {
    disabled.add(resolveSlug(extra));
  }
  for (const reEnabled of parseEnvList(readEnv("VOICERO_ENABLE_DISABLED_APPS"))) {
    disabled.delete(resolveSlug(reEnabled));
  }
  // Array.from, not [...disabled]: some consuming packages (trpc) compile
  // below es2015 without downlevelIteration, where spreading a Set is a
  // TS2802 error.
  return Array.from(disabled).sort();
}

/** True when the app (by slug or dirName) is disabled by VOICERO policy. */
export function isAppDisabled(slugOrDirName: string | undefined | null): boolean {
  if (!slugOrDirName) return false;
  return getDisabledAppSlugs().includes(resolveSlug(slugOrDirName));
}

/** Drop disabled apps from a listing (registry, admin views). Keeps order. */
export function excludeDisabledApps<T extends { slug: string }>(apps: readonly T[]): T[] {
  return apps.filter((app) => !isAppDisabled(app.slug));
}
