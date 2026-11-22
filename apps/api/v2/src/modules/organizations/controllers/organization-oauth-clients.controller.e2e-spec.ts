import type { Team } from "@calcom/prisma/client";
import { UserPermissionRole } from "@calcom/prisma/client";
import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { OrganizationRepositoryFixture } from "test/fixtures/repository/organization.repository.fixture";
import { UserRepositoryFixture } from "test/fixtures/repository/users.repository.fixture";
import { randomString } from "test/utils/randomString";
import { withApiAuth } from "test/utils/withApiAuth";
import { AppModule } from "@/app.module";
import { bootstrap } from "@/bootstrap";
import { PrismaModule } from "@/modules/prisma/prisma.module";
import { TokensModule } from "@/modules/tokens/tokens.module";
import { UsersModule } from "@/modules/users/users.module";
import { UserWithProfile } from "@/modules/users/users.repository";

/**
 * Runs against a real Postgres database (jest-e2e config). NOT runnable in
 * the sandbox — run on VPS A once the dev install is up (tasks 1.8/1.9).
 *
 * Covers the org-scoped OAuth client endpoints (task 2.5): the provisioning
 * flow creates one client per business org right after creating the org.
 */
describe("OrganizationsController OAuth clients (e2e)", () => {
  let app: INestApplication;
  const adminEmail = `organizations-oauth-admin-${randomString()}@api.com`;
  const orgSlug = `business-${randomString()}`.toLowerCase();
  let admin: UserWithProfile;
  let businessOrg: Team;
  let createdClientId: string;

  let userRepositoryFixture: UserRepositoryFixture;
  let organizationRepositoryFixture: OrganizationRepositoryFixture;

  beforeAll(async () => {
    const moduleRef = await withApiAuth(
      adminEmail,
      Test.createTestingModule({
        imports: [AppModule, PrismaModule, UsersModule, TokensModule],
      })
    ).compile();
    userRepositoryFixture = new UserRepositoryFixture(moduleRef);
    organizationRepositoryFixture = new OrganizationRepositoryFixture(moduleRef);

    admin = await userRepositoryFixture.create({
      email: adminEmail,
      username: adminEmail,
      role: UserPermissionRole.ADMIN,
    });

    businessOrg = await organizationRepositoryFixture.create({
      name: "Acme Dental",
      slug: orgSlug,
    });

    app = moduleRef.createNestApplication();
    bootstrap(app as NestExpressApplication);

    await app.init();
  });

  afterAll(async () => {
    await organizationRepositoryFixture.delete(businessOrg.id);
    await userRepositoryFixture.deleteByEmail(admin.email);
    await app.close();
  });

  it("POST creates an OAuth client for the organization and returns the secret once", () => {
    return request(app.getHttpServer())
      .post(`/v2/organizations/${businessOrg.id}/oauth-clients`)
      .send({
        name: "VOICERO provisioning",
        redirectUris: ["https://app.voicero.io/calcom/oauth-callback"],
        permissions: ["BOOKING_READ", "BOOKING_WRITE"],
      })
      .expect(201)
      .then((res) => {
        expect(res.body.status).toBe("success");
        expect(typeof res.body.data.clientId).toBe("string");
        expect(res.body.data.clientId.length).toBeGreaterThan(0);
        expect(typeof res.body.data.clientSecret).toBe("string");
        expect(res.body.data.clientSecret.length).toBeGreaterThan(0);
        createdClientId = res.body.data.clientId;
      });
  });

  it("GET lists the created client (and never returns the secret)", () => {
    return request(app.getHttpServer())
      .get(`/v2/organizations/${businessOrg.id}/oauth-clients`)
      .expect(200)
      .then((res) => {
        expect(res.body.status).toBe("success");
        expect(Array.isArray(res.body.data)).toBe(true);
        const client = res.body.data.find((c: { id: string }) => c.id === createdClientId);
        expect(client).toBeDefined();
        expect(client.secret).toBeUndefined();
        expect(client.clientSecret).toBeUndefined();
      });
  });

  it("POST returns 404 for a non-existent organization", () => {
    return request(app.getHttpServer())
      .post("/v2/organizations/999999/oauth-clients")
      .send({
        name: "VOICERO provisioning",
        redirectUris: ["https://app.voicero.io/calcom/oauth-callback"],
        permissions: ["BOOKING_READ"],
      })
      .expect(404);
  });
});
