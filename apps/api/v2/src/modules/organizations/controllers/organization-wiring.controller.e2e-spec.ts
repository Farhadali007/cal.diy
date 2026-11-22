import type { Team } from "@calcom/prisma/client";
import { MembershipRole, UserPermissionRole } from "@calcom/prisma/client";
import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { MembershipRepositoryFixture } from "test/fixtures/repository/membership.repository.fixture";
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
 * Covers the org wiring endpoints (task 2.8): default schedule (get-or-create)
 * and event-type creation owned by a managed user of the org.
 */
describe("OrganizationsController wiring (e2e)", () => {
  let app: INestApplication;
  const adminEmail = `organizations-wiring-admin-${randomString()}@api.com`;
  const memberEmail = `organizations-wiring-member-${randomString()}@api.com`;
  const orgSlug = `business-${randomString()}`.toLowerCase();
  let admin: UserWithProfile;
  let member: UserWithProfile;
  let businessOrg: Team;

  let userRepositoryFixture: UserRepositoryFixture;
  let organizationRepositoryFixture: OrganizationRepositoryFixture;
  let membershipRepositoryFixture: MembershipRepositoryFixture;

  beforeAll(async () => {
    const moduleRef = await withApiAuth(
      adminEmail,
      Test.createTestingModule({
        imports: [AppModule, PrismaModule, UsersModule, TokensModule],
      })
    ).compile();
    userRepositoryFixture = new UserRepositoryFixture(moduleRef);
    organizationRepositoryFixture = new OrganizationRepositoryFixture(moduleRef);
    membershipRepositoryFixture = new MembershipRepositoryFixture(moduleRef);

    admin = await userRepositoryFixture.create({
      email: adminEmail,
      username: adminEmail,
      role: UserPermissionRole.ADMIN,
    });

    businessOrg = await organizationRepositoryFixture.create({
      name: "Acme Dental",
      slug: orgSlug,
    });

    member = await userRepositoryFixture.create({
      email: memberEmail,
      username: memberEmail,
      role: UserPermissionRole.USER,
    });
    await membershipRepositoryFixture.addUserToOrg(
      member,
      businessOrg,
      MembershipRole.MEMBER,
      true
    );

    app = moduleRef.createNestApplication();
    bootstrap(app as NestExpressApplication);

    await app.init();
  });

  afterAll(async () => {
    await organizationRepositoryFixture.delete(businessOrg.id);
    await userRepositoryFixture.delete(member.id);
    await userRepositoryFixture.delete(admin.id);
    await app.close();
  });

  it("get-or-creates the default schedule for the member", async () => {
    const first = await request(app.getHttpServer())
      .post(`/v2/organizations/${businessOrg.id}/schedules`)
      .send({ userId: member.id, timeZone: "Europe/Berlin" })
      .expect(201);
    expect(first.body.data.id).toBeTruthy();
    expect(first.body.data.timeZone).toBe("Europe/Berlin");

    // Second call returns the SAME schedule — never a duplicate.
    const second = await request(app.getHttpServer())
      .post(`/v2/organizations/${businessOrg.id}/schedules`)
      .send({ userId: member.id, timeZone: "Europe/Berlin" })
      .expect(201);
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it("creates an event type owned by the member", async () => {
    const response = await request(app.getHttpServer())
      .post(`/v2/organizations/${businessOrg.id}/event-types`)
      .send({ userId: member.id, title: "Consultation", slug: "consultation", length: 30 })
      .expect(201);
    expect(response.body.data.id).toBeTruthy();
    expect(response.body.data.title).toBe("Consultation");
    expect(response.body.data.slug).toBe("consultation");
  });

  it("rejects wiring for a user who is not a member of the org", async () => {
    await request(app.getHttpServer())
      .post(`/v2/organizations/${businessOrg.id}/schedules`)
      .send({ userId: admin.id, timeZone: "Europe/Berlin" })
      .expect(400);
  });

  it("rejects an invalid timezone", async () => {
    await request(app.getHttpServer())
      .post(`/v2/organizations/${businessOrg.id}/schedules`)
      .send({ userId: member.id, timeZone: "Not/AZone" })
      .expect(400);
  });
});
