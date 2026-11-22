import { CreateOAuthClientInput } from "@calcom/platform-types";
import { User } from "@calcom/prisma/client";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { OAuthClientsService } from "@/modules/oauth-clients/services/oauth-clients/oauth-clients.service";
import { OrganizationsRepository } from "@/modules/organizations/index/organizations.repository";
import { OrganizationOAuthClientsService } from "@/modules/organizations/services/organization-oauth-clients.service";

jest.mock("@calcom/platform-libraries", () => ({}), { virtual: true });

describe("OrganizationOAuthClientsService", () => {
  let service: OrganizationOAuthClientsService;
  let organizationsRepository: jest.Mocked<OrganizationsRepository>;
  let membershipsRepository: jest.Mocked<MembershipsRepository>;
  let oAuthClientsService: jest.Mocked<OAuthClientsService>;

  const adminUser = { id: 1, role: "ADMIN" } as User;
  const orgAdminUser = { id: 2, role: "USER" } as User;
  const memberUser = { id: 3, role: "USER" } as User;
  const outsiderUser = { id: 4, role: "USER" } as User;

  const org = { id: 10, isOrganization: true };
  const team = { id: 11, isOrganization: false };

  const createInput = {
    name: "VOICERO provisioning",
    redirectUris: ["https://app.voicero.io/calcom/oauth-callback"],
    permissions: ["BOOKING_READ", "BOOKING_WRITE"],
  } as CreateOAuthClientInput;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationOAuthClientsService,
        {
          provide: OrganizationsRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: MembershipsRepository,
          useValue: { isUserOrganizationAdmin: jest.fn() },
        },
        {
          provide: OAuthClientsService,
          useValue: {
            createOAuthClient: jest.fn(),
            getOAuthClients: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrganizationOAuthClientsService>(OrganizationOAuthClientsService);
    organizationsRepository = module.get(OrganizationsRepository);
    membershipsRepository = module.get(MembershipsRepository);
    oAuthClientsService = module.get(OAuthClientsService);

    organizationsRepository.findById.mockImplementation(async ({ id }: { id: number }) => {
      if (id === org.id) return org as never;
      if (id === team.id) return team as never;
      return null as never;
    });
    membershipsRepository.isUserOrganizationAdmin.mockImplementation(
      async (userId: number) => userId === orgAdminUser.id
    );
    oAuthClientsService.createOAuthClient.mockResolvedValue({
      clientId: "client-1",
      clientSecret: "secret-1",
    });
    oAuthClientsService.getOAuthClients.mockResolvedValue([{ id: "client-1" } as never]);
  });

  describe("createOAuthClient", () => {
    it("creates a client for an instance admin, delegating with the path org id", async () => {
      const result = await service.createOAuthClient(adminUser, org.id, createInput);
      expect(result).toEqual({ clientId: "client-1", clientSecret: "secret-1" });
      expect(oAuthClientsService.createOAuthClient).toHaveBeenCalledWith(org.id, createInput);
    });

    it("creates a client for an admin of the organization", async () => {
      await service.createOAuthClient(orgAdminUser, org.id, createInput);
      expect(oAuthClientsService.createOAuthClient).toHaveBeenCalledWith(org.id, createInput);
    });

    it("rejects creating for a plain member with 403", async () => {
      await expect(service.createOAuthClient(memberUser, org.id, createInput)).rejects.toThrow(
        ForbiddenException
      );
      expect(oAuthClientsService.createOAuthClient).not.toHaveBeenCalled();
    });

    it("rejects creating for an outsider with 403", async () => {
      await expect(service.createOAuthClient(outsiderUser, org.id, createInput)).rejects.toThrow(
        ForbiddenException
      );
    });

    it("returns 404 when creating for a non-organization team", async () => {
      await expect(service.createOAuthClient(adminUser, team.id, createInput)).rejects.toThrow(
        NotFoundException
      );
    });

    it("returns 404 when creating for a missing organization", async () => {
      await expect(service.createOAuthClient(adminUser, 999, createInput)).rejects.toThrow(NotFoundException);
    });
  });

  describe("listOAuthClients", () => {
    it("lists clients for an admin of the organization", async () => {
      const result = await service.listOAuthClients(orgAdminUser, org.id);
      expect(result).toEqual([{ id: "client-1" }]);
      expect(oAuthClientsService.getOAuthClients).toHaveBeenCalledWith(org.id);
    });

    it("rejects listing for a plain member with 403", async () => {
      await expect(service.listOAuthClients(memberUser, org.id)).rejects.toThrow(ForbiddenException);
      expect(oAuthClientsService.getOAuthClients).not.toHaveBeenCalled();
    });

    it("returns 404 when listing for a non-organization team", async () => {
      await expect(service.listOAuthClients(adminUser, team.id)).rejects.toThrow(NotFoundException);
    });
  });
});
