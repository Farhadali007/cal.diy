import { BadRequestException } from "@nestjs/common";

/**
 * Focused spec for the task 2.7 suspension check in
 * OAuthFlowService.exchangeAuthorizationToken: a suspended org must not be
 * able to mint access tokens from an authorization code. Only the exchange
 * path is covered here; the rest of OAuthFlowService has no unit spec.
 */
jest.mock("@calcom/platform-libraries", () => ({}), { virtual: true });

import type { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { OAuthFlowService } from "@/modules/oauth-clients/services/oauth-flow.service";
import type { TokensRepository } from "@/modules/tokens/tokens.repository";

describe("OAuthFlowService.exchangeAuthorizationToken — org suspension (task 2.7)", () => {
  function clientRow(suspended: boolean | null) {
    return {
      id: "client-1",
      secret: "secret-1",
      organizationId: 11,
      organization: {
        organizationSettings: suspended === null ? null : { suspended },
      },
      authorizationTokens: [{ id: "auth-1", owner: { id: 7 } }],
    };
  }

  function setup() {
    const tokensRepository = {
      createOAuthTokens: jest.fn(),
      invalidateAuthorizationToken: jest.fn(),
      getAccessTokenOwnerId: jest.fn(),
      getAccessTokenExpiryDate: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<
        TokensRepository,
        | "createOAuthTokens"
        | "invalidateAuthorizationToken"
        | "getAccessTokenOwnerId"
        | "getAccessTokenExpiryDate"
      >
    >;
    const oAuthClientRepository = {
      getOAuthClientWithAuthTokens: jest.fn(),
    } as unknown as jest.Mocked<Pick<OAuthClientRepository, "getOAuthClientWithAuthTokens">>;
    const redisService = { redis: { setex: jest.fn() } } as never;
    const service = new OAuthFlowService(
      tokensRepository as never,
      oAuthClientRepository as never,
      redisService
    );
    return { tokensRepository, oAuthClientRepository, service };
  }

  it("refuses to mint tokens for a suspended org", async () => {
    const { oAuthClientRepository, tokensRepository, service } = setup();
    oAuthClientRepository.getOAuthClientWithAuthTokens.mockResolvedValue(clientRow(true) as never);
    await expect(service.exchangeAuthorizationToken("auth-1", "client-1", "secret-1")).rejects.toThrow(
      BadRequestException
    );
    await expect(service.exchangeAuthorizationToken("auth-1", "client-1", "secret-1")).rejects.toThrow(
      /suspended/i
    );
    expect(tokensRepository.createOAuthTokens).not.toHaveBeenCalled();
    expect(tokensRepository.invalidateAuthorizationToken).not.toHaveBeenCalled();
  });

  it("mints tokens for an unsuspended org", async () => {
    const { oAuthClientRepository, tokensRepository, service } = setup();
    oAuthClientRepository.getOAuthClientWithAuthTokens.mockResolvedValue(clientRow(false) as never);
    tokensRepository.createOAuthTokens.mockResolvedValue({
      accessToken: "at-1",
      refreshToken: "rt-1",
      accessTokenExpiresAt: new Date("2026-11-23T00:00:00.000Z"),
      refreshTokenExpiresAt: new Date("2026-12-23T00:00:00.000Z"),
    } as never);
    tokensRepository.getAccessTokenOwnerId.mockResolvedValue(7);
    tokensRepository.getAccessTokenExpiryDate.mockResolvedValue(new Date("2026-11-23T00:00:00.000Z"));
    const keys = await service.exchangeAuthorizationToken("auth-1", "client-1", "secret-1");
    expect(keys.accessToken).toBe("at-1");
    expect(tokensRepository.invalidateAuthorizationToken).toHaveBeenCalledWith("auth-1");
  });

  it("mints tokens when the org has no settings row (legacy orgs read as not suspended)", async () => {
    const { oAuthClientRepository, tokensRepository, service } = setup();
    oAuthClientRepository.getOAuthClientWithAuthTokens.mockResolvedValue(clientRow(null) as never);
    tokensRepository.createOAuthTokens.mockResolvedValue({
      accessToken: "at-1",
      refreshToken: "rt-1",
      accessTokenExpiresAt: new Date("2026-11-23T00:00:00.000Z"),
      refreshTokenExpiresAt: new Date("2026-12-23T00:00:00.000Z"),
    } as never);
    tokensRepository.getAccessTokenOwnerId.mockResolvedValue(7);
    tokensRepository.getAccessTokenExpiryDate.mockResolvedValue(new Date("2026-11-23T00:00:00.000Z"));
    const keys = await service.exchangeAuthorizationToken("auth-1", "client-1", "secret-1");
    expect(keys.accessToken).toBe("at-1");
  });
});
