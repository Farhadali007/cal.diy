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
import { CreateOrganizationInputDto } from "@/modules/organizations/inputs/organizations.input";
import { OrganizationOutputResponseDto } from "@/modules/organizations/outputs/organization.output";
import { PrismaModule } from "@/modules/prisma/prisma.module";
import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { TokensModule } from "@/modules/tokens/tokens.module";
import { UsersModule } from "@/modules/users/users.module";
import { UserWithProfile } from "@/modules/users/users.repository";

/**
 * Runs against a real Postgres database (jest-e2e config). NOT runnable in
 * the sandbox — run on VPS A once the dev install is up (tasks 1.8/1.9).
 */
describe("OrganizationsController (e2e)", () => {
  let app: INestApplication;
  const adminEmail = `organizations-controller-admin-${randomString()}@api.com`;
  const slug = `acme-${randomString()}`.toLowerCase();
  let admin: UserWithProfile;
  let createdOrgId: number | null = null;

  let userRepositoryFixture: UserRepositoryFixture;
  let organizationRepositoryFixture: OrganizationRepositoryFixture;
  let prismaRead: PrismaReadService["prisma"];

  beforeAll(async () => {
    const moduleRef = await withApiAuth(
      adminEmail,
      Test.createTestingModule({
        imports: [AppModule, PrismaModule, UsersModule, TokensModule],
      })
    ).compile();
    userRepositoryFixture = new UserRepositoryFixture(moduleRef);
    organizationRepositoryFixture = new OrganizationRepositoryFixture(moduleRef);
    prismaRead = moduleRef.get(PrismaReadService).prisma;

    admin = await userRepositoryFixture.create({
      email: adminEmail,
      username: adminEmail,
      role: UserPermissionRole.ADMIN,
    });

    app = moduleRef.createNestApplication();
    bootstrap(app as NestExpressApplication);

    await app.init();
  });

  afterAll(async () => {
    if (createdOrgId) {
      await organizationRepositoryFixture.delete(createdOrgId);
    }
    await userRepositoryFixture.deleteByEmail(admin.email);
    await app.close();
  });

  it("/organizations (POST) creates an organization for an admin", () => {
    return request(app.getHttpServer())
      .post("/v2/organizations")
      .send({
        name: "Acme Dental Practice",
        slug,
        timeZone: "Europe/Berlin",
        orgAutoAcceptEmail: "acme.com",
        metadata: { voiceroBusinessId: 42 },
      } satisfies CreateOrganizationInputDto)
      .expect(201)
      .then(async (res) => {
        expect(res.body).toMatchObject({
          status: "success",
          data: {
            id: expect.any(Number),
            name: "Acme Dental Practice",
            slug,
            timeZone: "Europe/Berlin",
            isOrganization: true,
            createdAt: expect.any(String),
          },
        } satisfies OrganizationOutputResponseDto);
        createdOrgId = res.body.data.id;
      });
  });

  it("persists the settings row and the OWNER membership for the provisioning admin", async () => {
    expect(createdOrgId).not.toBeNull();
    const team = (await organizationRepositoryFixture.get(createdOrgId as number)) as Team;
    expect(team.isOrganization).toBe(true);
    expect(team.parentId).toBeNull();

    const settings = await prismaRead.organizationSettings.findUnique({
      where: { organizationId: createdOrgId as number },
    });
    expect(settings).toMatchObject({
      orgAutoAcceptEmail: "acme.com",
      isAdminAPIEnabled: true,
    });

    const membership = await prismaRead.membership.findFirst({
      where: { teamId: createdOrgId as number, userId: admin.id },
    });
    expect(membership).toMatchObject({ role: "OWNER", accepted: true });
  });

  it("/organizations (POST) returns 409 for a duplicate slug", () => {
    return request(app.getHttpServer())
      .post("/v2/organizations")
      .send({
        name: "Acme Again",
        slug,
      } satisfies CreateOrganizationInputDto)
      .expect(409);
  });

  it("/organizations (POST) returns 400 for an invalid slug", () => {
    return request(app.getHttpServer())
      .post("/v2/organizations")
      .send({
        name: "Bad Slug",
        slug: "NOT-lowercase",
      } satisfies CreateOrganizationInputDto)
      .expect(400);
  });
});
