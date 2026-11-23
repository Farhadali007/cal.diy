import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createFirstAdmin, FIRST_ADMIN_MARKER, FIRST_ADMIN_SETUP_EXPIRY_HOURS } from "./createFirstAdmin";

const INPUT = {
  email: "admin@voicero.io",
  name: "VOICERO Admin",
  username: "voicero-admin",
  webappUrl: "http://127.0.0.1:3300",
};

function mockPrisma(
  overrides: {
    markerUser?: { id: number } | null;
    emailUser?: { id: number } | null;
    usernameUser?: { id: number } | null;
  } = {}
): { mock: PrismaClient } {
  const findFirst = vi
    .fn()
    .mockResolvedValueOnce(overrides.markerUser ?? null)
    .mockResolvedValueOnce(overrides.usernameUser ?? null);
  return {
    mock: {
      user: {
        findFirst,
        findUnique: vi.fn().mockResolvedValue(overrides.emailUser ?? null),
        create: vi.fn().mockResolvedValue({ id: 42 }),
      },
      resetPasswordRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: "cmresetrequestid" }),
      },
    } as unknown as PrismaClient,
  };
}

describe("createFirstAdmin", () => {
  it("refuses when a CLI-provisioned admin already exists", async () => {
    const { mock } = mockPrisma({ markerUser: { id: 7 } });
    await expect(createFirstAdmin(mock, INPUT)).rejects.toThrow(/already provisioned/);
    expect(mock.user.create).not.toHaveBeenCalled();
    expect(mock.resetPasswordRequest.create).not.toHaveBeenCalled();
  });

  it("refuses when the email is already taken", async () => {
    const { mock } = mockPrisma({ emailUser: { id: 9 } });
    await expect(createFirstAdmin(mock, INPUT)).rejects.toThrow(/already exists/);
    expect(mock.user.create).not.toHaveBeenCalled();
  });

  it("refuses when the username is already taken", async () => {
    const { mock } = mockPrisma({ usernameUser: { id: 11 } });
    await expect(createFirstAdmin(mock, INPUT)).rejects.toThrow(/already taken/);
    expect(mock.user.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...INPUT, email: "not-an-email" }, /Invalid email/],
    [{ ...INPUT, name: "Al" }, /at least 3 characters/],
    [{ ...INPUT, username: "Voicero Admin" }, /Invalid username/],
    [{ ...INPUT, username: "voicero-" }, /Invalid username/],
    [{ ...INPUT, webappUrl: "127.0.0.1:3300" }, /Invalid webapp URL/],
  ])("rejects invalid input %s", async (input, message) => {
    const { mock } = mockPrisma();
    await expect(createFirstAdmin(mock, input)).rejects.toThrow(message);
    expect(mock.user.create).not.toHaveBeenCalled();
  });

  it("creates the admin with the setup-route fields and a 6h single-use setup link", async () => {
    const { mock } = mockPrisma();
    const before = Date.now();
    const result = await createFirstAdmin(mock, INPUT);

    expect(mock.user.create).toHaveBeenCalledTimes(1);
    const createData = (mock.user.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(createData.username).toBe("voicero-admin");
    expect(createData.email).toBe("admin@voicero.io");
    expect(createData.role).toBe("ADMIN");
    expect(createData.name).toBe("VOICERO Admin");
    expect(createData.emailVerified).toBeInstanceOf(Date);
    expect(createData.locale).toBe("en");
    expect(createData.identityProvider).toBe("CAL");
    expect(createData.creationSource).toBe("WEBAPP");
    expect(createData.password).toBeUndefined();
    expect(createData.metadata.provisionedBy).toBe(FIRST_ADMIN_MARKER);

    expect(mock.resetPasswordRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(mock.resetPasswordRequest.create).toHaveBeenCalledTimes(1);
    const resetData = (mock.resetPasswordRequest.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(resetData.email).toBe("admin@voicero.io");
    const sixHours = FIRST_ADMIN_SETUP_EXPIRY_HOURS * 60 * 60 * 1000;
    expect(resetData.expires.getTime()).toBeGreaterThanOrEqual(before + sixHours - 60_000);
    expect(resetData.expires.getTime()).toBeLessThanOrEqual(Date.now() + sixHours);

    expect(result).toEqual({
      userId: 42,
      email: "admin@voicero.io",
      username: "voicero-admin",
      setupUrl: "http://127.0.0.1:3300/auth/forgot-password/cmresetrequestid",
      expiresAt: resetData.expires,
    });
  });

  it("normalizes email case/whitespace and strips the webapp URL trailing slash", async () => {
    const { mock } = mockPrisma();
    const result = await createFirstAdmin(mock, {
      ...INPUT,
      email: "  Admin@Voicero.IO ",
      webappUrl: "http://127.0.0.1:3300/",
    });
    const createData = (mock.user.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(createData.email).toBe("admin@voicero.io");
    expect(result.setupUrl).toBe("http://127.0.0.1:3300/auth/forgot-password/cmresetrequestid");
    expect(result.email).toBe("admin@voicero.io");
  });
});
