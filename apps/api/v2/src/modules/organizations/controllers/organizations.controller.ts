import { SUCCESS_STATUS } from "@calcom/platform-constants";
import {
  CreateOAuthClientInput,
  CreateScheduleOutput_2024_06_11,
} from "@calcom/platform-types";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiParam, ApiTags as DocsTags } from "@nestjs/swagger";
import { plainToClass } from "class-transformer";
import {
  AddOrganizationMemberInputDto,
  UpdateOrganizationMemberInputDto,
} from "../inputs/organization-members.input";
import { LinkManagedOrganizationInputDto } from "../inputs/organization-ownership.input";
import { UpdateOrganizationSuspensionInputDto } from "../inputs/organization-suspension.input";
import {
  CreateOrganizationEventTypeInputDto,
  CreateOrganizationScheduleInputDto,
} from "../inputs/organization-wiring.input";
import { CreateOrganizationInputDto } from "../inputs/organizations.input";
import { OrganizationOutputDto, OrganizationOutputResponseDto } from "../outputs/organization.output";
import {
  OrganizationMemberDto,
  OrganizationMemberResponseDto,
  OrganizationMembersResponseDto,
} from "../outputs/organization-members.output";
import {
  ManagedOrganizationLinkDto,
  ManagedOrganizationLinkResponseDto,
  ManagedOrganizationLinksResponseDto,
} from "../outputs/organization-ownership.output";
import {
  OrganizationSuspensionDto,
  OrganizationSuspensionResponseDto,
} from "../outputs/organization-suspension.output";
import { API_VERSIONS_VALUES } from "@/lib/api-versions";
import { API_KEY_OR_ACCESS_TOKEN_HEADER } from "@/lib/docs/headers";
import { GetUser } from "@/modules/auth/decorators/get-user/get-user.decorator";
import { ApiAuthGuard } from "@/modules/auth/guards/api-auth/api-auth.guard";
import { CreateOAuthClientResponseDto } from "@/modules/oauth-clients/controllers/oauth-clients/responses/CreateOAuthClientResponse.dto";
import { GetOAuthClientsResponseDto } from "@/modules/oauth-clients/controllers/oauth-clients/responses/GetOAuthClientsResponse.dto";
import { OrganizationMembersService } from "@/modules/organizations/services/organization-members.service";
import { OrganizationOAuthClientsService } from "@/modules/organizations/services/organization-oauth-clients.service";
import { OrganizationOwnershipService } from "@/modules/organizations/services/organization-ownership.service";
import { OrganizationSuspensionService } from "@/modules/organizations/services/organization-suspension.service";
import { OrganizationWiringService } from "@/modules/organizations/services/organization-wiring.service";
import { OrganizationsService } from "@/modules/organizations/services/organizations.service";
import { UserWithProfile } from "@/modules/users/users.repository";
import { CreateEventTypeOutput_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/outputs/create-event-type.output";
import { EventTypeResponseTransformPipe } from "@/platform/event-types/event-types_2024_06_14/pipes/event-type-response.transformer";

@Controller({
  path: "/v2/organizations",
  version: API_VERSIONS_VALUES,
})
@UseGuards(ApiAuthGuard)
@DocsTags("Organizations")
@ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly organizationOwnershipService: OrganizationOwnershipService,
    private readonly organizationMembersService: OrganizationMembersService,
    private readonly organizationOAuthClientsService: OrganizationOAuthClientsService,
    private readonly organizationSuspensionService: OrganizationSuspensionService,
    private readonly organizationWiringService: OrganizationWiringService,
    private readonly eventTypeResponseTransformPipe: EventTypeResponseTransformPipe
  ) {}

  @Post("/")
  @ApiOperation({
    summary: "Create an organization",
    description:
      "Creates an organization (a Team with isOrganization=true), its OrganizationSettings row, and an OWNER membership for the calling admin. Only instance admins can create organizations.",
  })
  async createOrganization(
    @Body() body: CreateOrganizationInputDto,
    @GetUser() user: UserWithProfile
  ): Promise<OrganizationOutputResponseDto> {
    const organization = await this.organizationsService.createOrganization(user, body);
    return {
      status: SUCCESS_STATUS,
      data: plainToClass(OrganizationOutputDto, organization, { strategy: "excludeAll" }),
    };
  }

  @Post("/:organizationId/managed-organizations")
  @ApiOperation({
    summary: "Link a managed organization",
    description:
      "Makes the organization a managed organization of the given manager organization (agency manages business). Only instance admins or admins of the manager organization can link.",
  })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  async linkManagedOrganization(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @Body() body: LinkManagedOrganizationInputDto,
    @GetUser() user: UserWithProfile
  ): Promise<ManagedOrganizationLinkResponseDto> {
    const link = await this.organizationOwnershipService.linkManagedOrganization(
      user,
      organizationId,
      body.managedOrganizationId
    );
    return {
      status: SUCCESS_STATUS,
      data: plainToClass(ManagedOrganizationLinkDto, link, { strategy: "excludeAll" }),
    };
  }

  @Get("/:organizationId/managed-organizations")
  @ApiOperation({ summary: "List managed organizations" })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  async listManagedOrganizations(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @GetUser() user: UserWithProfile
  ): Promise<ManagedOrganizationLinksResponseDto> {
    const links = await this.organizationOwnershipService.listManagedOrganizations(user, organizationId);
    return {
      status: SUCCESS_STATUS,
      data: links.map((link) => plainToClass(ManagedOrganizationLinkDto, link, { strategy: "excludeAll" })),
    };
  }

  @Delete("/:organizationId/managed-organizations/:managedOrganizationId")
  @ApiOperation({ summary: "Unlink a managed organization" })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  @ApiParam({ name: "managedOrganizationId", type: Number, required: true })
  async unlinkManagedOrganization(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @Param("managedOrganizationId", ParseIntPipe) managedOrganizationId: number,
    @GetUser() user: UserWithProfile
  ): Promise<ManagedOrganizationLinkResponseDto> {
    const link = await this.organizationOwnershipService.unlinkManagedOrganization(
      user,
      organizationId,
      managedOrganizationId
    );
    return {
      status: SUCCESS_STATUS,
      data: plainToClass(ManagedOrganizationLinkDto, link, { strategy: "excludeAll" }),
    };
  }

  @Get("/:organizationId/manager")
  @ApiOperation({ summary: "Get the managing organization" })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  async getManagerOrganization(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @GetUser() user: UserWithProfile
  ): Promise<OrganizationOutputResponseDto> {
    const manager = await this.organizationOwnershipService.getManagerOrganization(user, organizationId);
    return {
      status: SUCCESS_STATUS,
      data: plainToClass(OrganizationOutputDto, manager, { strategy: "excludeAll" }),
    };
  }

  @Get("/:organizationId/members")
  @ApiOperation({
    summary: "List organization members",
    description:
      "Lists the members of the organization with their roles. Only instance admins or admins of the organization can list members.",
  })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  async listMembers(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @GetUser() user: UserWithProfile
  ): Promise<OrganizationMembersResponseDto> {
    const members = await this.organizationMembersService.listMembers(user, organizationId);
    return {
      status: SUCCESS_STATUS,
      data: members.map((member) => plainToClass(OrganizationMemberDto, member, { strategy: "excludeAll" })),
    };
  }

  @Post("/:organizationId/members")
  @ApiOperation({
    summary: "Add a member to the organization",
    description:
      "Attaches an existing user to the organization with the given role (MEMBER or ADMIN). The membership is auto-accepted: there is no invite-accept flow in the fork. Only instance admins or admins of the organization can add members. New users are created through the managed-users endpoint, not here.",
  })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  async addMember(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @Body() body: AddOrganizationMemberInputDto,
    @GetUser() user: UserWithProfile
  ): Promise<OrganizationMemberResponseDto> {
    const member = await this.organizationMembersService.addMember(user, organizationId, body);
    return {
      status: SUCCESS_STATUS,
      data: plainToClass(OrganizationMemberDto, member, { strategy: "excludeAll" }),
    };
  }

  @Patch("/:organizationId/members/:userId")
  @ApiOperation({
    summary: "Change a member's role",
    description:
      "Changes a member's role between MEMBER and ADMIN. OWNER cannot be assigned here, and the last OWNER cannot be demoted. Only instance admins or admins of the organization can change roles.",
  })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  @ApiParam({ name: "userId", type: Number, required: true })
  async updateMemberRole(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @Param("userId", ParseIntPipe) userId: number,
    @Body() body: UpdateOrganizationMemberInputDto,
    @GetUser() user: UserWithProfile
  ): Promise<OrganizationMemberResponseDto> {
    const member = await this.organizationMembersService.updateMemberRole(user, organizationId, userId, body);
    return {
      status: SUCCESS_STATUS,
      data: plainToClass(OrganizationMemberDto, member, { strategy: "excludeAll" }),
    };
  }

  @Delete("/:organizationId/members/:userId")
  @ApiOperation({
    summary: "Remove a member from the organization",
    description:
      "Removes the membership (the user account itself is not deleted). The last OWNER cannot be removed. Only instance admins or admins of the organization can remove members.",
  })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  @ApiParam({ name: "userId", type: Number, required: true })
  async removeMember(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @Param("userId", ParseIntPipe) userId: number,
    @GetUser() user: UserWithProfile
  ): Promise<OrganizationMemberResponseDto> {
    const member = await this.organizationMembersService.removeMember(user, organizationId, userId);
    return {
      status: SUCCESS_STATUS,
      data: plainToClass(OrganizationMemberDto, member, { strategy: "excludeAll" }),
    };
  }

  @Post("/:organizationId/oauth-clients")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create an OAuth client for the organization",
    description:
      "Creates an OAuth client scoped to this organization (task 2.5 — automatic provisioning). Unlike POST /v2/oauth-clients, which scopes to the caller's main org, this endpoint takes the target org from the path so a provisioning admin can create a client for a freshly created org. Only instance admins or admins of the organization can create clients. The client secret is returned ONCE — store it encrypted.",
  })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  async createOAuthClientForOrganization(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @Body() body: CreateOAuthClientInput,
    @GetUser() user: UserWithProfile
  ): Promise<CreateOAuthClientResponseDto> {
    const credentials = await this.organizationOAuthClientsService.createOAuthClient(
      user,
      organizationId,
      body
    );
    // Return the raw credentials, mirroring the upstream oauth-clients
    // controller: CreateOAuthClientOutput has no @Expose() decorators, so
    // plainToClass(..., { strategy: "excludeAll" }) serialized data to {}.
    return {
      status: SUCCESS_STATUS,
      data: credentials,
    };
  }

  @Get("/:organizationId/oauth-clients")
  @ApiOperation({
    summary: "List the organization's OAuth clients",
    description:
      "Lists the OAuth clients scoped to this organization (task 2.5 — provisioning status checks). Only instance admins or admins of the organization can list clients. Client secrets are never returned here.",
  })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  async listOAuthClientsForOrganization(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @GetUser() user: UserWithProfile
  ): Promise<GetOAuthClientsResponseDto> {
    const clients = await this.organizationOAuthClientsService.listOAuthClients(user, organizationId);
    // Return the service result raw, mirroring the upstream oauth-clients
    // controller: PlatformOAuthClientDto has no @Expose() decorators, so
    // plainToClass(..., { strategy: "excludeAll" }) serialized every item
    // to {}. The upstream transformOAuthClient already strips the secret.
    return {
      status: SUCCESS_STATUS,
      data: clients,
    };
  }

  @Get("/:organizationId/suspension")
  @ApiOperation({
    summary: "Get the organization's suspension status",
    description:
      "Reads the org-level suspension state (task 2.7). Instance admins, members of the organization, and members of its managing organization can read it.",
  })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  async getSuspension(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @GetUser() user: UserWithProfile
  ): Promise<OrganizationSuspensionResponseDto> {
    const suspension = await this.organizationSuspensionService.getSuspension(user, organizationId);
    return {
      status: SUCCESS_STATUS,
      data: plainToClass(OrganizationSuspensionDto, suspension, { strategy: "excludeAll" }),
    };
  }

  @Patch("/:organizationId/suspension")
  @ApiOperation({
    summary: "Suspend or resume the organization",
    description:
      "Sets the org-level suspension state (task 2.7). While suspended, the org's OAuth client credentials are rejected at auth, so all API access for the business stops. Only instance admins or admins of the managing organization can suspend or resume — the org's own admins cannot lift their own suspension. Suspending requires a reason; resuming clears it.",
  })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  async updateSuspension(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @Body() body: UpdateOrganizationSuspensionInputDto,
    @GetUser() user: UserWithProfile
  ): Promise<OrganizationSuspensionResponseDto> {
    const suspension = await this.organizationSuspensionService.updateSuspension(user, organizationId, body);
    return {
      status: SUCCESS_STATUS,
      data: plainToClass(OrganizationSuspensionDto, suspension, { strategy: "excludeAll" }),
    };
  }

  @Post("/:organizationId/schedules")
  @ApiOperation({
    summary: "Get or create the default schedule for an org member",
    description:
      "Returns the member's existing default schedule when one exists (managed-user creation already creates one when a timeZone is passed); only creates a new default schedule (Monday–Friday 9AM–5PM in the given timezone) when none exists. Never creates a duplicate default schedule. Only instance admins or admins of the organization can wire schedules.",
  })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  async getOrCreateDefaultSchedule(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @Body() body: CreateOrganizationScheduleInputDto,
    @GetUser() user: UserWithProfile
  ): Promise<CreateScheduleOutput_2024_06_11> {
    const schedule = await this.organizationWiringService.getOrCreateDefaultSchedule(
      user,
      organizationId,
      body
    );
    return {
      status: SUCCESS_STATUS,
      data: schedule,
    };
  }

  @Post("/:organizationId/event-types")
  @ApiOperation({
    summary: "Create an event type owned by an org member",
    description:
      "Creates a user event type owned by the given org member (normally the managed user created at provisioning) — unlike the generic event-type endpoint, which always creates for the authenticated user. Only instance admins or admins of the organization can wire event types. When scheduleId is omitted, the member's default schedule is used.",
  })
  @ApiParam({ name: "organizationId", type: Number, required: true })
  async createEventTypeForMember(
    @Param("organizationId", ParseIntPipe) organizationId: number,
    @Body() body: CreateOrganizationEventTypeInputDto,
    @GetUser() user: UserWithProfile
  ): Promise<CreateEventTypeOutput_2024_06_14> {
    const eventType = await this.organizationWiringService.createEventTypeForMember(
      user,
      organizationId,
      body
    );
    return {
      status: SUCCESS_STATUS,
      data: this.eventTypeResponseTransformPipe.transform(eventType),
    };
  }
}
