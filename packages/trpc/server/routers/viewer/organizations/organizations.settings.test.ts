import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCtx,
  getErrorCode,
  membershipRow,
  orgRow,
  settingsRow,
  userRowWithOrg,
} from "./organizations.test-helpers";

const {
  mockUserFindUnique,
  mockTeamFindUnique,
  mockMembershipFindUnique,
  mockSettingsFindUnique,
  mockSettingsUpsert,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockTeamFindUnique: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockSettingsFindUnique: vi.fn(),
  mockSettingsUpsert: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    team: { findUnique: (...args: unknown[]) => mockTeamFindUnique(...args) },
    membership: { findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args) },
    organizationSettings: {
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
      upsert: (...args: unknown[]) => mockSettingsUpsert(...args),
    },
  },
}));

import { getSettingsHandler } from "./getSettings.handler";
import { updateSettingsHandler } from "./updateSettings.handler";

describe("organizations router - settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue(userRowWithOrg());
    mockTeamFindUnique.mockResolvedValue(orgRow());
    mockMembershipFindUnique.mockResolvedValue(membershipRow({ role: "ADMIN" }));
  });

  it("getSettings returns the stored row", async () => {
    mockSettingsFindUnique.mockResolvedValue(settingsRow({ allowSEOIndexing: true }));
    const result = await getSettingsHandler({ ctx: createCtx() });
    expect(result).toMatchObject({ organizationId: 1, allowSEOIndexing: true });
  });

  it("getSettings returns schema defaults when no row exists yet", async () => {
    mockSettingsFindUnique.mockResolvedValue(null);
    const result = await getSettingsHandler({ ctx: createCtx() });
    expect(result).toMatchObject({
      organizationId: 1,
      orgAutoAcceptEmail: "",
      lockEventTypeCreationForUsers: false,
      orgAutoJoinOnSignup: true,
      isAdminAPIEnabled: false,
      disableAttendeeConfirmationEmail: false,
    });
  });

  it("updateSettings upserts the provided fields", async () => {
    const updated = settingsRow({ allowSEOIndexing: true, lockEventTypeCreationForUsers: true });
    mockSettingsUpsert.mockResolvedValue(updated);
    const result = await updateSettingsHandler({
      ctx: createCtx(),
      input: { allowSEOIndexing: true, lockEventTypeCreationForUsers: true },
    });
    expect(result).toEqual(updated);
    expect(mockSettingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 1 },
        update: { allowSEOIndexing: true, lockEventTypeCreationForUsers: true },
      })
    );
  });

  it("updateSettings creates the row with an empty auto-accept domain when not provided", async () => {
    mockSettingsUpsert.mockResolvedValue(settingsRow({ allowSEOIndexing: true }));
    await updateSettingsHandler({ ctx: createCtx(), input: { allowSEOIndexing: true } });
    expect(mockSettingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ organizationId: 1, orgAutoAcceptEmail: "" }),
      })
    );
  });

  it("updateSettings rejects an empty update with BAD_REQUEST", async () => {
    const code = await getErrorCode(() => updateSettingsHandler({ ctx: createCtx(), input: {} }));
    expect(code).toBe("BAD_REQUEST");
    expect(mockSettingsUpsert).not.toHaveBeenCalled();
  });
});
