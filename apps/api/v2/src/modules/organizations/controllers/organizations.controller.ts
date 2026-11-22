import { SUCCESS_STATUS } from "@calcom/platform-constants";
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiParam, ApiTags as DocsTags } from "@nestjs/swagger";
import { plainToClass } from "class-transformer";
import { LinkManagedOrganizationInputDto } from "../inputs/organization-ownership.input";
import { CreateOrganizationInputDto } from "../inputs/organizations.input";
import { OrganizationOutputDto, OrganizationOutputResponseDto } from "../outputs/organization.output";
import {
  ManagedOrganizationLinkDto,
  ManagedOrganizationLinkResponseDto,
  ManagedOrganizationLinksResponseDto,
} from "../outputs/organization-ownership.output";
import { API_VERSIONS_VALUES } from "@/lib/api-versions";
import { API_KEY_OR_ACCESS_TOKEN_HEADER } from "@/lib/docs/headers";
import { GetUser } from "@/modules/auth/decorators/get-user/get-user.decorator";
import { ApiAuthGuard } from "@/modules/auth/guards/api-auth/api-auth.guard";
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
    private readonly organizationOwnershipService: OrganizationOwnershipService
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
}
