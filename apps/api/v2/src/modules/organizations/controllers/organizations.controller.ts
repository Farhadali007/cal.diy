import { SUCCESS_STATUS } from "@calcom/platform-constants";
import {
  CreateOAuthClientInput,
  CreateOAuthClientOutput,
  PlatformOAuthClientDto,
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
import { API_VERSIONS_VALUES } from "@/lib/api-versions";
import { API_KEY_OR_ACCESS_TOKEN_HEADER } from "@/lib/docs/headers";
import { GetUser } from "@/modules/auth/decorators/get-user/get-user.decorator";
import { ApiAuthGuard } from "@/modules/auth/guards/api-auth/api-auth.guard";
import { CreateOAuthClientResponseDto } from "@/modules/oauth-clients/controllers/oauth-clients/responses/CreateOAuthClientResponse.dto";
import { GetOAuthClientsResponseDto } from "@/modules/oauth-clients/controllers/oauth-clients/responses/GetOAuthClientsResponse.dto";
import { OrganizationMembersService } from "@/modules/organizations/services/organization-members.service";
import { OrganizationOAuthClientsService } from "@/modules/organizations/services/organization-oauth-clients.service";
import { OrganizationOwnershipService } from "@/modules/organizations/services/organization-ownership.service";
import { OrganizationsService } from "@/modules/organizations/services/organizations.service";
import { UserWithProfile } from "@/modules/users/users.repository";

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
    private readonly organizationOAuthClientsService: OrganizationOAuthClientsService
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
    return {
      status: SUCCESS_STATUS,
      data: plainToClass(CreateOAuthClientOutput, credentials, { strategy: "excludeAll" }),
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
    return {
      status: SUCCESS_STATUS,
      data: plainToClass(PlatformOAuthClientDto, clients, { strategy: "excludeAll" }),
    };
  }
}
