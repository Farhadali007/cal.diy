import { ApiAuthGuardRequest, ApiAuthGuardUser } from "@/modules/auth/strategies/api-auth/api-auth.strategy";
import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { UsersService } from "@/modules/users/services/users.service";
import { UserWithProfile } from "@/modules/users/users.repository";
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

@Injectable()
export class OAuthClientGuard implements CanActivate {
  constructor(private oAuthClientRepository: OAuthClientRepository, private usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiAuthGuardRequest>();
    const organizationId = this.getOrganizationId(context);
    const user: ApiAuthGuardUser = request.user;
    const oAuthClientId = request.params.clientId;

    if (!oAuthClientId) {
      throw new ForbiddenException("OAuthClientGuard - No OAuth client associated with the request.");
    }

    if (!user) {
      throw new ForbiddenException("OAuthClientGuard - No organization associated with the user.");
    }

    const oAuthClient = await this.oAuthClientRepository.getOAuthClient(oAuthClientId);

    if (!oAuthClient) {
      throw new NotFoundException("OAuthClientGuard - OAuth client not found.");
    }

    // System admins manage OAuth clients platform-wide (provisioning,
    // health) and need no organization association: the old order threw
    // "No organization associated with the user" for an admin with no org
    // membership before the isSystemAdmin check below could run, so the
    // admin path was unreachable. The client-existence check above still
    // runs for everyone.
    if (user.isSystemAdmin) {
      return true;
    }

    if (!organizationId) {
      throw new ForbiddenException("OAuthClientGuard - No organization associated with the user.");
    }

    const allowed = Boolean(oAuthClient.organizationId === organizationId);
    if (!allowed) {
      throw new ForbiddenException(
        `OAuthClientGuard - forbidden. oAuth client with id=${oAuthClientId} does not belong to the organization with id=${organizationId}.`
      );
    }
    return true;
  }

  getOrganizationId(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const user: UserWithProfile = request.user;
    const authMethodOrganizationId = request.organizationId;
    if (authMethodOrganizationId) return authMethodOrganizationId;

    const userOrganizationId = user ? this.usersService.getUserMainOrgId(user) : null;
    return userOrganizationId;
  }
}
