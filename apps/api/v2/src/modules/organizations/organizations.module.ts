import { Logger, Module } from "@nestjs/common";
import { AppsRepository } from "@/modules/apps/apps.repository";
import { ConferencingRepository } from "@/modules/conferencing/repositories/conferencing.repository";
import { ConferencingService } from "@/modules/conferencing/services/conferencing.service";
import { GoogleMeetService } from "@/modules/conferencing/services/google-meet.service";
import { Office365VideoService } from "@/modules/conferencing/services/office365-video.service";
import { ZoomVideoService } from "@/modules/conferencing/services/zoom-video.service";
import { CredentialsRepository } from "@/modules/credentials/credentials.repository";
import { EmailModule } from "@/modules/email/email.module";
import { EmailService } from "@/modules/email/email.service";
import { MembershipsModule } from "@/modules/memberships/memberships.module";
import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { UserOOORepository } from "@/modules/ooo/repositories/ooo.repository";
import { UserOOOService } from "@/modules/ooo/services/ooo.service";
import { OrganizationsController } from "@/modules/organizations/controllers/organizations.controller";
import { OrganizationsRepository } from "@/modules/organizations/index/organizations.repository";
import { OrganizationMembersService } from "@/modules/organizations/services/organization-members.service";
import { OrganizationOAuthClientsService } from "@/modules/organizations/services/organization-oauth-clients.service";
import { OrganizationOwnershipService } from "@/modules/organizations/services/organization-ownership.service";
import { OrganizationSuspensionService } from "@/modules/organizations/services/organization-suspension.service";
import { OrganizationsService } from "@/modules/organizations/services/organizations.service";
import { PrismaModule } from "@/modules/prisma/prisma.module";
import { RedisModule } from "@/modules/redis/redis.module";
import { RedisService } from "@/modules/redis/redis.service";
import { StripeModule } from "@/modules/stripe/stripe.module";
import { TokensRepository } from "@/modules/tokens/tokens.repository";
import { UsersModule } from "@/modules/users/users.module";
import { TeamsVerifiedResourcesRepository } from "@/modules/verified-resources/teams-verified-resources.repository";
import { EventTypesModule_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/event-types.module";
import { EventTypesPrivateLinksModule } from "@/platform/event-types-private-links/event-types-private-links.module";
import { SchedulesModule_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/schedules.module";
import { InputSchedulesService_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/services/input-schedules.service";
import { SchedulesService_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/services/schedules.service";

@Module({
  imports: [
    PrismaModule,
    StripeModule,
    SchedulesModule_2024_06_11,
    UsersModule,
    RedisModule,
    EmailModule,
    EventTypesModule_2024_06_14,
    MembershipsModule,
    EventTypesPrivateLinksModule,
  ],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsRepository,
    OrganizationsService,
    OrganizationOwnershipService,
    OrganizationMembersService,
    OrganizationOAuthClientsService,
    OrganizationSuspensionService,
    EmailService,
    UserOOOService,
    UserOOORepository,
    CredentialsRepository,
    AppsRepository,
    RedisService,
    ConferencingRepository,
    GoogleMeetService,
    ConferencingService,
    ZoomVideoService,
    Office365VideoService,
    TokensRepository,
    TeamsVerifiedResourcesRepository,
    SchedulesService_2024_06_11,
    InputSchedulesService_2024_06_11,
    OAuthClientRepository,
    Logger,
  ],
  exports: [
    OrganizationsRepository,
    OrganizationsService,
    OrganizationOwnershipService,
    OrganizationMembersService,
    OrganizationOAuthClientsService,
    OrganizationSuspensionService,
  ],
})
export class OrganizationsModule {}
