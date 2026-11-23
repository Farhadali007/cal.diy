import { afterEach, describe, expect, it, vi } from "vitest";

import { excludeDisabledApps, getDisabledAppSlugs, isAppDisabled } from "./disabledApps";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAppDisabled — default policy (task 4.7)", () => {
  it("disables unused apps by slug, across categories", () => {
    // AI voice agents (VOICERO has its own voice widget)
    expect(isAppDisabled("retell-ai")).toBe(true);
    expect(isAppDisabled("fonio-ai")).toBe(true);
    expect(isAppDisabled("greetmate-ai")).toBe(true);
    expect(isAppDisabled("millis-ai")).toBe(true);
    // CRM / automation / analytics / payments / misc
    expect(isAppDisabled("hubspot")).toBe(true);
    expect(isAppDisabled("salesforce")).toBe(true);
    expect(isAppDisabled("zapier")).toBe(true);
    expect(isAppDisabled("make")).toBe(true);
    expect(isAppDisabled("ga4")).toBe(true);
    expect(isAppDisabled("paypal")).toBe(true);
    expect(isAppDisabled("mock-payment-app")).toBe(true);
    expect(isAppDisabled("giphy")).toBe(true);
    expect(isAppDisabled("wordpress")).toBe(true);
  });

  it("disables niche calendars and conferencing by slug", () => {
    expect(isAppDisabled("apple-calendar")).toBe(true);
    expect(isAppDisabled("caldav-calendar")).toBe(true);
    expect(isAppDisabled("exchange")).toBe(true);
    expect(isAppDisabled("exchange2013-calendar")).toBe(true);
    expect(isAppDisabled("exchange2016-calendar")).toBe(true);
    expect(isAppDisabled("lark-calendar")).toBe(true);
    expect(isAppDisabled("feishu-calendar")).toBe(true);
    expect(isAppDisabled("jitsi")).toBe(true);
    expect(isAppDisabled("tandem")).toBe(true);
    expect(isAppDisabled("huddle01")).toBe(true);
    expect(isAppDisabled("webex")).toBe(true);
    expect(isAppDisabled("whereby")).toBe(true);
    expect(isAppDisabled("vital-automation")).toBe(true);
    expect(isAppDisabled("wipe-my-cal")).toBe(true);
  });

  it("disables by dirName too (registry + install gate see dirNames)", () => {
    expect(isAppDisabled("jitsivideo")).toBe(true);
    expect(isAppDisabled("applecalendar")).toBe(true);
    expect(isAppDisabled("caldavcalendar")).toBe(true);
    expect(isAppDisabled("exchangecalendar")).toBe(true);
    expect(isAppDisabled("tandemvideo")).toBe(true);
    expect(isAppDisabled("huddle01video")).toBe(true);
    expect(isAppDisabled("vital")).toBe(true);
    expect(isAppDisabled("wipemycalother")).toBe(true);
    expect(isAppDisabled("zapier")).toBe(true);
  });

  it("keeps the 8 required apps enabled, by slug and by dirName", () => {
    const keptSlugs = [
      "google-calendar",
      "office365-calendar",
      "ics-feed",
      "daily-video",
      "google-meet",
      "msteams",
      "zoom",
      "stripe",
    ];
    for (const slug of keptSlugs) {
      expect(isAppDisabled(slug)).toBe(false);
    }
    const keptDirNames = [
      "googlecalendar",
      "office365calendar",
      "ics-feedcalendar",
      "dailyvideo",
      "googlevideo",
      "office365video",
      "zoomvideo",
      "stripepayment",
    ];
    for (const dirName of keptDirNames) {
      expect(isAppDisabled(dirName)).toBe(false);
    }
  });

  it("is a denylist: unknown apps are not disabled", () => {
    expect(isAppDisabled("some-future-app")).toBe(false);
    expect(isAppDisabled("")).toBe(false);
    expect(isAppDisabled(undefined)).toBe(false);
    expect(isAppDisabled(null)).toBe(false);
  });

  it("tolerates case and surrounding whitespace", () => {
    expect(isAppDisabled("ZAPIER")).toBe(true);
    expect(isAppDisabled("  zapier  ")).toBe(true);
    expect(isAppDisabled("JitsiVideo")).toBe(true);
  });
});

describe("isAppDisabled — env overrides", () => {
  it("VOICERO_DISABLED_APPS adds extras without touching other apps", () => {
    vi.stubEnv("VOICERO_DISABLED_APPS", "zoom, google-meet");
    expect(isAppDisabled("zoom")).toBe(true);
    expect(isAppDisabled("google-meet")).toBe(true);
    expect(isAppDisabled("msteams")).toBe(false);
    expect(isAppDisabled("zapier")).toBe(true);
  });

  it("VOICERO_DISABLED_APPS accepts dirNames", () => {
    vi.stubEnv("VOICERO_DISABLED_APPS", "zoomvideo");
    expect(isAppDisabled("zoom")).toBe(true);
    expect(isAppDisabled("zoomvideo")).toBe(true);
  });

  it("VOICERO_ENABLE_DISABLED_APPS re-enables by slug or dirName", () => {
    vi.stubEnv("VOICERO_ENABLE_DISABLED_APPS", "jitsi, caldavcalendar");
    expect(isAppDisabled("jitsi")).toBe(false);
    expect(isAppDisabled("jitsivideo")).toBe(false);
    expect(isAppDisabled("caldav-calendar")).toBe(false);
    expect(isAppDisabled("zapier")).toBe(true);
  });

  it("re-enable wins over an extra disable", () => {
    vi.stubEnv("VOICERO_DISABLED_APPS", "zoom");
    vi.stubEnv("VOICERO_ENABLE_DISABLED_APPS", "zoom");
    expect(isAppDisabled("zoom")).toBe(false);
  });
});

describe("getDisabledAppSlugs", () => {
  it("returns the 98 default disabled slugs, sorted, without the kept apps", () => {
    const disabled = getDisabledAppSlugs();
    expect(disabled).toHaveLength(98);
    expect(disabled).toContain("zapier");
    expect(disabled).toContain("retell-ai");
    expect(disabled).toContain("jitsi");
    expect(disabled).not.toContain("zoom");
    expect(disabled).not.toContain("google-calendar");
    expect(disabled).not.toContain("daily-video");
    expect(disabled).not.toContain("stripe");
    expect([...disabled].sort()).toEqual(disabled);
  });

  it("reflects env overrides", () => {
    vi.stubEnv("VOICERO_DISABLED_APPS", "zoom");
    vi.stubEnv("VOICERO_ENABLE_DISABLED_APPS", "jitsi");
    const disabled = getDisabledAppSlugs();
    expect(disabled).toContain("zoom");
    expect(disabled).not.toContain("jitsi");
    expect(disabled).toHaveLength(98);
  });
});

describe("excludeDisabledApps — listing filter", () => {
  it("removes disabled apps and keeps enabled ones in order", () => {
    const apps = [
      { slug: "google-calendar", name: "Google Calendar" },
      { slug: "zapier", name: "Zapier" },
      { slug: "zoom", name: "Zoom" },
      { slug: "retell-ai", name: "Retell AI" },
      { slug: "stripe", name: "Stripe" },
    ];
    expect(excludeDisabledApps(apps)).toEqual([
      { slug: "google-calendar", name: "Google Calendar" },
      { slug: "zoom", name: "Zoom" },
      { slug: "stripe", name: "Stripe" },
    ]);
  });

  it("returns an empty list unchanged", () => {
    expect(excludeDisabledApps([])).toEqual([]);
  });

  it("respects env re-enables in listings", () => {
    vi.stubEnv("VOICERO_ENABLE_DISABLED_APPS", "jitsi");
    const apps = [{ slug: "jitsi" }, { slug: "zapier" }, { slug: "zoom" }];
    expect(excludeDisabledApps(apps)).toEqual([{ slug: "jitsi" }, { slug: "zoom" }]);
  });
});
