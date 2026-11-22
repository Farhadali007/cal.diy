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
import { LinkManagedOrganizationInputDto } from "@/modules/organizations/inputs/organization-ownership.input";
import { OrganizationOutputResponseDto } from "@/modules/organizations/outputs/organization.output";
import {
  ManagedOrganizationLinkResponseDto,
  ManagedOrganizationLinksResponseDto,
} from "@/modules/organizations/outputs/organization-ownership.output";
import { PrismaModule } from "@/modules/prisma/prisma.module";
import { TokensModule } from "@/modules/tokens/tokens.module";
import { UsersModule } from "@/modules/users/users.module";
import { UserWithProfile } from "@/modules/users/users.repository";

/**
 * Runs against a real Postgres database (jest-e2e config). NOT runnable in
 * the sandbox — run on VPS A once the dev install is up (tasks 1.8/1.9).
 */
describe("OrganizationsController managed organizations (e2e)", () => {
  let app: INestApplication;
  const adminEmail = `organizations-ownership-admin-${randomString()}@api.com`;
  const agencySlug = `agency-${randomString()}`.toLowerCase();
  const businessSlug = `business-${randomString()}`.toLowerCase();
  let admin: UserWithProfile;
  let agencyOrg: Team;
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

    agencyOrg = await organizationRepositoryFixture.create({
      name: "Acme Agency",
      slug: agencySlug,
    });
    businessOrg = await organizationRepositoryFixture.create({
      name: "Acme Dental",
      slug: businessSlug,
    });

    app = moduleRef.createNestApplication();
    bootstrap(app as NestExpressApplication);

    await app.init();
  });

  afterAll(async () => {
    await organizationRepositoryFixture.delete(businessOrg.id);
    await organizationRepositoryFixture.delete(agencyOrg.id);
    await userRepositoryFixture.deleteByEmail(admin.email);
    await app.close();
  });

  it("POST links a managed organization for an admin", () => {
    return request(app.getHttpServer())
      .post(`/v2/organizations/${agencyOrg.id}/managed-organizations`)
      .send({
        managedOrganizationId: businessOrg.id,
      } satisfies LinkManagedOrganizationInputDto)
      .expect(201)
      .then((res) => {
        expect(res.body).toMatchObject({
          status: "success",
          data: {
            managerOrganizationId: agencyOrg.id,
            managedOrganizationId: businessOrg.id,
            createdAt: expect.any(String),
            managedOrganization: {
              id: businessOrg.id,
              name: "Acme Dental",
              slug: businessSlug,
            },
          },
        } satisfies ManagedOrganizationLinkResponseDto);
      });
  });

  it("POST returns 409 when the org is already managed", () => {
    return request(app.getHttpServer())
      .post(`/v2/organizations/${agencyOrg.id}/managed-organizations`)
      .send({
        managedOrganizationId: businessOrg.id,
      } satisfies LinkManagedOrganizationInputDto)
      .expect(409);
  });

  it("POST returns 400 for a self-link", () => {
    return request(app.getHttpServer())
      .post(`/v2/organizations/${agencyOrg.id}/managed-organizations`)
      .send({
        managedOrganizationId: agencyOrg.id,
      } satisfies LinkManagedOrganizationInputDto)
      .expect(400);
  });

  it("GET lists the managed organizations", () => {
    return request(app.getHttpServer())
      .get(`/v2/organizations/${agencyOrg.id}/managed-organizations`)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({
          status: "success",
          data: [
            {
              managerOrganizationId: agencyOrg.id,
              managedOrganizationId: businessOrg.id,
              createdAt: expect.any(String),
              managedOrganization: {
                id: businessOrg.id,
                name: "Acme Dental",
                slug: businessSlug,
              },
            },
          ],
        } satisfies ManagedOrganizationLinksResponseDto);
      });
  });

  it("GET returns the manager organization", () => {
    return request(app.getHttpServer())
      .get(`/v2/organizations/${businessOrg.id}/manager`)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({
          status: "success",
          data: {
            id: agencyOrg.id,
            name: "Acme Agency",
            slug: agencySlug,
            timeZone: expect.any(String),
            isOrganization: true,
            createdAt: expect.any(String),
          },
        } satisfies OrganizationOutputResponseDto);
      });
  });

  it("DELETE unlinks and the manager lookup then returns 404", async () => {
    await request(app.getHttpServer())
      .delete(`/v2/organizations/${agencyOrg.id}/managed-organizations/${businessOrg.id}`)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({
          status: "success",
          data: {
            managerOrganizationId: agencyOrg.id,
            managedOrganizationId: businessOrg.id,
            createdAt: expect.any(String),
            managedOrganization: {
              id: businessOrg.id,
              name: "Acme Dental",
              slug: businessSlug,
            },
          },
        } satisfies ManagedOrganizationLinkResponseDto);
      });

    await request(app.getHttpServer()).get(`/v2/organizations/${businessOrg.id}/manager`).expect(404);
  });
});
