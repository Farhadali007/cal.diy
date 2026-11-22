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
 * Covers the org suspension endpoints (task 2.7): suspend/resume + status.
 * The auth-enforcement legs (ApiAuthStrategy rejection, token-exchange
 * refusal) are covered by unit specs; this file covers the HTTP surface.
 */
describe("OrganizationsController suspension (e2e)", () => {
  let app: INestApplication;
  const adminEmail = `organizations-suspension-admin-${randomString()}@api.com`;
  const orgSlug = `business-${randomString()}`.toLowerCase();
  let admin: UserWithProfile;
  let businessOrg: Team;

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
    await userRepositoryFixture.delete(admin.id);
    await app.close();
  });

  it("reads an unsuspended org as not suspended", async () => {
    const response = await request(app.getHttpServer())
      .get(`/v2/organizations/${businessOrg.id}/suspension`)
      .expect(200);
    expect(response.body.data.suspended).toBe(false);
    expect(response.body.data.organizationId).toBe(businessOrg.id);
  });

  it("suspends with a reason, then resumes and clears it", async () => {
    const suspended = await request(app.getHttpServer())
      .patch(`/v2/organizations/${businessOrg.id}/suspension`)
      .send({ suspended: true, reason: "Payment overdue" })
      .expect(200);
    expect(suspended.body.data.suspended).toBe(true);
    expect(suspended.body.data.suspendedReason).toBe("Payment overdue");
    expect(suspended.body.data.suspendedById).toBe(admin.id);
    expect(suspended.body.data.suspendedAt).toBeTruthy();

    const resumed = await request(app.getHttpServer())
      .patch(`/v2/organizations/${businessOrg.id}/suspension`)
      .send({ suspended: false })
      .expect(200);
    expect(resumed.body.data.suspended).toBe(false);
    expect(resumed.body.data.suspendedReason).toBeNull();
    expect(resumed.body.data.suspendedAt).toBeNull();
    expect(resumed.body.data.suspendedById).toBeNull();
  });

  it("rejects suspending without a reason", async () => {
    await request(app.getHttpServer())
      .patch(`/v2/organizations/${businessOrg.id}/suspension`)
      .send({ suspended: true })
      .expect(400);
  });

  it("returns 404 for an unknown organization", async () => {
    await request(app.getHttpServer()).get("/v2/organizations/999999/suspension").expect(404);
  });
});
