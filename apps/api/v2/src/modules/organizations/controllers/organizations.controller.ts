import { SUCCESS_STATUS } from "@calcom/platform-constants";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags as DocsTags } from "@nestjs/swagger";
import { plainToClass } from "class-transformer";
import { CreateOrganizationInputDto } from "../inputs/organizations.input";
import { OrganizationOutputDto, OrganizationOutputResponseDto } from "../outputs/organization.output";
import { API_VERSIONS_VALUES } from "@/lib/api-versions";
import { API_KEY_OR_ACCESS_TOKEN_HEADER } from "@/lib/docs/headers";
import { GetUser } from "@/modules/auth/decorators/get-user/get-user.decorator";
import { ApiAuthGuard } from "@/modules/auth/guards/api-auth/api-auth.guard";
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
  constructor(private readonly organizationsService: OrganizationsService) {}

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
}
