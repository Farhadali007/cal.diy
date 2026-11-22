import { CreateOAuthClientInput, PlatformOAuthClientDto } from "@calcom/platform-types";
import { User } from "@calcom/prisma/client";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { OAuthClientsService } from "@/modules/oauth-clients/services/oauth-clients/oauth-clients.service";
import { OrganizationsRepository } from "@/modules/organizations/index/organizations.repository";

/**
 * Organization-scoped OAuth client management (task 2.5 — automatic provisioning).
 *
 * WHY THIS EXISTS: the upstream endpoint `POST /v2/oauth-clients` scopes the
 * client to the caller's org via `request.organizationId`, which the API auth
 * strategy sets from the API key's teamId or the user's MAIN org. A provisioning
 * admin creating a FRESH org cannot target it through that endpoint — the key
 * predates the org and the admin's main org is the platform org. These
 * endpoints take the org id from the PATH and authorize explicitly, so the
 * VOICERO provisioning flow (2.5) can create one OAuth client per business
 * org immediately after creating the org (2.1).
 *
 * AUTH: instance ADMIN, or an accepted OWNER/ADMIN member of the target org.
 * The client secret is returned ONCE at creation (same as the upstream
 * endpoint) — the caller stores it encrypted and never logs it. VOICERO
 * stores it in its encrypted integrations row for the business.
 *
 * Delegates the actual creation/listing to the upstream OAuthClientsService
 * (exported from the @Global OAuthClientModule for this purpose); this service
 * adds only the org-existence + org-membership authorization the upstream
 * endpoint gets implicitly from request.organizationId.
 */
@Injectable()
export class OrganizationOAuthClientsService {
  constructor(
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly membershipsRepository: MembershipsRepository,
    private readonly oAuthClientsService: OAuthClientsService
  ) {}

  async createOAuthClient(
    user: User,
    organizationId: number,
    input: CreateOAuthClientInput
  ): Promise<{ clientId: string; clientSecret: string }> {
    await this.requireOrganizationAdmin(user, organizationId);
    return this.oAuthClientsService.createOAuthClient(organizationId, input);
  }

  async listOAuthClients(user: User, organizationId: number): Promise<PlatformOAuthClientDto[]> {
    await this.requireOrganizationAdmin(user, organizationId);
    return this.oAuthClientsService.getOAuthClients(organizationId);
  }

  private async requireOrganizationAdmin(user: User, organizationId: number): Promise<void> {
    const organization = await this.organizationsRepository.findById({ id: organizationId });
    if (!organization || !organization.isOrganization) {
      throw new NotFoundException(`Organization with id ${organizationId} not found`);
    }
    const isAdmin = user.role === "ADMIN";
    const isOrgAdmin = await this.membershipsRepository.isUserOrganizationAdmin(user.id, organizationId);
    if (!isAdmin && !isOrgAdmin) {
      throw new ForbiddenException(`User ${user.id} is not an admin of organization ${organizationId}`);
    }
  }
}
