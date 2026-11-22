import { UserPermissionRole } from "@calcom/prisma/client";
import { ConflictException, ForbiddenException } from "@nestjs/common";

/**
 * Virtual mock is required because OrganizationsRepository (imported for the
 * DI token) has runtime imports from @calcom/platform-libraries whose dist
 * is not built in a fresh checkout. Same pattern as
 * unified-calendars-freebusy.service.spec.ts. The service under test never
 * touches the mocked module — the import only arrives through the
 * repository -> StripeService -> CredentialsRepository chain.
 */
jest.mock(
  "@calcom/platform-libraries",
  () => ({
    credentialForCalendarServiceSelect: {},
  }),
  { virtual: true }
);

import type { OrganizationsRepository } from "../index/organizations.repository";
import type { CreateOrganizationInputDto } from "../inputs/organizations.input";
import { OrganizationsService } from "./organizations.service";
import type { UserWithProfile } from "@/modules/users/users.repository";

describe("OrganizationsService", () => {
  const adminUser = { id: 7, role: UserPermissionRole.ADMIN } as UserWithProfile;
  const regularUser = { id: 8, role: UserPermissionRole.USER } as UserWithProfile;

  const fullInput: CreateOrganizationInputDto = {
    name: "Acme Dental Practice",
    slug: "acme-dental",
    timeZone: "Europe/Berlin",
    orgAutoAcceptEmail: "acme.com",
    metadata: { voiceroBusinessId: 42 },
  };

  const createdTeam = {
    id: 99,
    name: "Acme Dental Practice",
    slug: "acme-dental",
    timeZone: "Europe/Berlin",
    isOrganization: true,
    createdAt: new Date(),
  };

  function setup() {
    const repository = {
      findOrgBySlug: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<Pick<OrganizationsRepository, "findOrgBySlug" | "create">>;
    const service = new OrganizationsService(repository as unknown as OrganizationsRepository);
    return { repository, service };
  }

  it("creates an organization for an admin, passing owner + settings inputs to the repository", async () => {
    const { repository, service } = setup();
    repository.findOrgBySlug.mockResolvedValue(null);
    repository.create.mockResolvedValue(createdTeam as never);

    const result = await service.createOrganization(adminUser, fullInput);

    expect(result).toBe(createdTeam);
    expect(repository.findOrgBySlug).toHaveBeenCalledWith("acme-dental");
    expect(repository.create).toHaveBeenCalledWith({
      data: {
        name: "Acme Dental Practice",
        slug: "acme-dental",
        timeZone: "Europe/Berlin",
        metadata: { voiceroBusinessId: 42 },
      },
      ownerUserId: 7,
      orgAutoAcceptEmail: "acme.com",
    });
  });

  it("defaults orgAutoAcceptEmail to an empty string and omits optional fields when not provided", async () => {
    const { repository, service } = setup();
    repository.findOrgBySlug.mockResolvedValue(null);
    repository.create.mockResolvedValue(createdTeam as never);

    await service.createOrganization(adminUser, { name: "Acme", slug: "acme" });

    expect(repository.create).toHaveBeenCalledWith({
      data: {
        name: "Acme",
        slug: "acme",
        timeZone: undefined,
        metadata: undefined,
      },
      ownerUserId: 7,
      orgAutoAcceptEmail: "",
    });
  });

  it("rejects non-admin users with 403 and never touches the repository", async () => {
    const { repository, service } = setup();

    await expect(service.createOrganization(regularUser, fullInput)).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(repository.findOrgBySlug).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the slug is already taken and never creates a duplicate", async () => {
    const { repository, service } = setup();
    repository.findOrgBySlug.mockResolvedValue(createdTeam as never);

    await expect(service.createOrganization(adminUser, fullInput)).rejects.toBeInstanceOf(ConflictException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("propagates repository errors (the global Prisma filter maps P2002 races to 409)", async () => {
    const { repository, service } = setup();
    repository.findOrgBySlug.mockResolvedValue(null);
    const failure = new Error("unique constraint failed");
    repository.create.mockRejectedValue(failure);

    await expect(service.createOrganization(adminUser, fullInput)).rejects.toBe(failure);
  });
});
