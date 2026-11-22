import { UnauthorizedException } from "@nestjs/common";

/**
 * Virtual mocks are required because ApiAuthStrategy's module graph reaches
 * @calcom/platform-libraries, whose dist is not built in a fresh checkout.
 * Same pattern as permissions-coverage.spec.ts. The spec only exercises
 * oAuthClientStrategy, which touches three repositories; the other six
 * constructor dependencies are inert stubs.
 */
jest.mock("@calcom/platform-libraries", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/app-store", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/bookings", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/calendars", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/conferencing", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/emails", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/errors", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/event-types", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/organizations", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/private-links", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/repositories", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/schedules", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/slots", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/tasker", () => ({}), { virtual: true });

import { type ApiAuthGuardRequest, ApiAuthStrategy } from "./api-auth.strategy";
import type { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import type { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import type { UsersRepository, UserWithProfile } from "@/modules/users/users.repository";

describe("ApiAuthStrategy.oAuthClientStrategy — org suspension (task 2.7)", () => {
  const ownerUser = { id: 7, email: "owner@acme.test" } as UserWithProfile;

  function clientRow(suspended: boolean | null) {
    return {
      id: "client-1",
      secret: "secret-1",
      organizationId: 11,
      organization: {
        organizationSettings: suspended === null ? null : { suspended },
      },
    };
  }

  function setup() {
    const oauthRepository = {
      getOAuthClientWithOrgSuspension: jest.fn(),
    } as unknown as jest.Mocked<Pick<OAuthClientRepository, "getOAuthClientWithOrgSuspension">>;
    const membershipsRepository = {
      findPlatformOwnerUserId: jest.fn(),
      findPlatformAdminUserId: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<MembershipsRepository, "findPlatformOwnerUserId" | "findPlatformAdminUserId">
    >;
    const userRepository = {
      findByIdWithProfile: jest.fn(),
    } as unknown as jest.Mocked<Pick<UsersRepository, "findByIdWithProfile">>;
    const strategy = new ApiAuthStrategy(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      userRepository as never,
      {} as never,
      oauthRepository as never,
      {} as never,
      membershipsRepository as never
    );
    return { oauthRepository, membershipsRepository, userRepository, strategy };
  }

  function happyPath(repos: ReturnType<typeof setup>) {
    repos.membershipsRepository.findPlatformOwnerUserId.mockResolvedValue(7);
    repos.userRepository.findByIdWithProfile.mockResolvedValue(ownerUser);
  }

  it("rejects client credentials of a suspended org", async () => {
    const repos = setup();
    repos.oauthRepository.getOAuthClientWithOrgSuspension.mockResolvedValue(clientRow(true) as never);
    const request = {} as ApiAuthGuardRequest;
    await expect(repos.strategy.oAuthClientStrategy("client-1", "secret-1", request)).rejects.toThrow(
      UnauthorizedException
    );
    await expect(repos.strategy.oAuthClientStrategy("client-1", "secret-1", request)).rejects.toThrow(
      /suspended/i
    );
    // Fails fast: no owner lookup happens for a suspended org.
    expect(repos.membershipsRepository.findPlatformOwnerUserId).not.toHaveBeenCalled();
  });

  it("accepts client credentials of an unsuspended org", async () => {
    const repos = setup();
    repos.oauthRepository.getOAuthClientWithOrgSuspension.mockResolvedValue(clientRow(false) as never);
    happyPath(repos);
    const request = {} as ApiAuthGuardRequest;
    const user = await repos.strategy.oAuthClientStrategy("client-1", "secret-1", request);
    expect(user).toEqual(ownerUser);
    expect(request.organizationId).toBe(11);
  });

  it("accepts when the org has no settings row (legacy orgs read as not suspended)", async () => {
    const repos = setup();
    repos.oauthRepository.getOAuthClientWithOrgSuspension.mockResolvedValue(clientRow(null) as never);
    happyPath(repos);
    const request = {} as ApiAuthGuardRequest;
    const user = await repos.strategy.oAuthClientStrategy("client-1", "secret-1", request);
    expect(user).toEqual(ownerUser);
  });

  it("still rejects a wrong secret (pre-existing behavior)", async () => {
    const repos = setup();
    repos.oauthRepository.getOAuthClientWithOrgSuspension.mockResolvedValue(clientRow(false) as never);
    const request = {} as ApiAuthGuardRequest;
    await expect(repos.strategy.oAuthClientStrategy("client-1", "wrong-secret", request)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it("still rejects an unknown client (pre-existing behavior)", async () => {
    const repos = setup();
    repos.oauthRepository.getOAuthClientWithOrgSuspension.mockResolvedValue(null);
    const request = {} as ApiAuthGuardRequest;
    await expect(repos.strategy.oAuthClientStrategy("nope", "secret-1", request)).rejects.toThrow(
      UnauthorizedException
    );
  });
});
