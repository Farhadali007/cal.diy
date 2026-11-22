import type { Team } from "@calcom/prisma/client";
import { MembershipRole, UserPermissionRole } from "@calcom/prisma/client";
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
import {
  AddOrganizationMemberInputDto,
  UpdateOrganizationMemberInputDto,
} from "@/modules/organizations/inputs/organization-members.input";
import {
  OrganizationMemberResponseDto,
  OrganizationMembersResponseDto,
} from "@/modules/organizations/outputs/organization-members.output";
import { PrismaModule } from "@/modules/prisma/prisma.module";
import { TokensModule } from "@/modules/tokens/tokens.module";
import { UsersModule } from "@/modules/users/users.module";
import { UserWithProfile } from "@/modules/users/users.repository";

/**
 * Runs against a real Postgres database (jest-e2e config). NOT runnable in
 * the sandbox — run on VPS A once the dev install is up (tasks 1.8/1.9).
 */
describe("OrganizationsController members (e2e)", () => {
  let app: INestApplication;
  const adminEmail = `organizations-members-admin-${randomString()}@api.com`;
  const staffEmail = `organizations-members-staff-${randomString()}@api.com`;
  const orgSlug = `business-${randomString()}`.toLowerCase();
  let admin: UserWithProfile;
  let staff: UserWithProfile;
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

    staff = await userRepositoryFixture.create({
      email: staffEmail,
      username: staffEmail,
      role: UserPermissionRole.USER,
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
    await userRepositoryFixture.deleteByEmail(staff.email);
    await userRepositoryFixture.deleteByEmail(admin.email);
    await app.close();
  });

  it("POST adds an existing user as MEMBER", () => {
    return request(app.getHttpServer())
      .post(`/v2/organizations/${businessOrg.id}/members`)
      .send({
        email: staffEmail,
        role: MembershipRole.MEMBER,
      } satisfies AddOrganizationMemberInputDto)
      .expect(201)
      .then((res) => {
        expect(res.body).toMatchObject({
          status: "success",
          data: {
            id: expect.any(Number),
            userId: staff.id,
            role: MembershipRole.MEMBER,
            accepted: true,
            createdAt: expect.any(String),
            user: {
              id: staff.id,
              email: staffEmail,
              name: null,
              username: staffEmail,
            },
          },
        } satisfies OrganizationMemberResponseDto);
      });
  });

  it("POST returns 409 when adding a user who is already a member", () => {
    return request(app.getHttpServer())
      .post(`/v2/organizations/${businessOrg.id}/members`)
      .send({
        email: staffEmail,
        role: MembershipRole.MEMBER,
      } satisfies AddOrganizationMemberInputDto)
      .expect(409);
  });

  it("POST returns 404 for an unknown email", () => {
    return request(app.getHttpServer())
      .post(`/v2/organizations/${businessOrg.id}/members`)
      .send({
        email: `ghost-${randomString()}@api.com`,
        role: MembershipRole.MEMBER,
      } satisfies AddOrganizationMemberInputDto)
      .expect(404);
  });

  it("GET lists the members", () => {
    return request(app.getHttpServer())
      .get(`/v2/organizations/${businessOrg.id}/members`)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({
          status: "success",
          data: [
            {
              id: expect.any(Number),
              userId: staff.id,
              role: MembershipRole.MEMBER,
              accepted: true,
              createdAt: expect.any(String),
              user: {
                id: staff.id,
                email: staffEmail,
                name: null,
                username: staffEmail,
              },
            },
          ],
        } satisfies OrganizationMembersResponseDto);
      });
  });

  it("PATCH changes the member role to ADMIN", () => {
    return request(app.getHttpServer())
      .patch(`/v2/organizations/${businessOrg.id}/members/${staff.id}`)
      .send({
        role: MembershipRole.ADMIN,
      } satisfies UpdateOrganizationMemberInputDto)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({
          status: "success",
          data: {
            id: expect.any(Number),
            userId: staff.id,
            role: MembershipRole.ADMIN,
            accepted: true,
            createdAt: expect.any(String),
            user: {
              id: staff.id,
              email: staffEmail,
              name: null,
              username: staffEmail,
            },
          },
        } satisfies OrganizationMemberResponseDto);
      });
  });

  it("PATCH returns 400 for the OWNER role", () => {
    return request(app.getHttpServer())
      .patch(`/v2/organizations/${businessOrg.id}/members/${staff.id}`)
      .send({
        role: MembershipRole.OWNER,
      } satisfies UpdateOrganizationMemberInputDto)
      .expect(400);
  });

  it("DELETE removes the member and the list is then empty", async () => {
    await request(app.getHttpServer())
      .delete(`/v2/organizations/${businessOrg.id}/members/${staff.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({
          status: "success",
          data: {
            id: expect.any(Number),
            userId: staff.id,
            role: MembershipRole.ADMIN,
            accepted: true,
            createdAt: expect.any(String),
            user: {
              id: staff.id,
              email: staffEmail,
              name: null,
              username: staffEmail,
            },
          },
        } satisfies OrganizationMemberResponseDto);
      });

    await request(app.getHttpServer())
      .get(`/v2/organizations/${businessOrg.id}/members`)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({
          status: "success",
          data: [],
        } satisfies OrganizationMembersResponseDto);
      });
  });
});
