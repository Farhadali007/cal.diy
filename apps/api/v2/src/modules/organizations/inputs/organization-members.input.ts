import { MembershipRole } from "@calcom/prisma/enums";
import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsIn } from "class-validator";

// OWNER is deliberately not assignable through this API: the org creator holds
// it (task 2.1) and ownership transfer is not a VOICERO provisioning need.
// Granting OWNER through member management would let an ADMIN manufacture a
// second owner and lock the real owner out of their own org.
export const ASSIGNABLE_MEMBER_ROLES = [MembershipRole.MEMBER, MembershipRole.ADMIN] as const;

export class AddOrganizationMemberInputDto {
  @IsEmail()
  @ApiProperty({
    example: "staff@acme-dental.com",
    description: "Email of an existing Cal.diy user to add to the organization.",
  })
  email!: string;

  @IsIn(ASSIGNABLE_MEMBER_ROLES)
  @ApiProperty({
    example: MembershipRole.MEMBER,
    enum: ASSIGNABLE_MEMBER_ROLES,
    description: "Role in the organization. OWNER cannot be assigned here.",
  })
  role!: MembershipRole;
}

export class UpdateOrganizationMemberInputDto {
  @IsIn(ASSIGNABLE_MEMBER_ROLES)
  @ApiProperty({
    example: MembershipRole.ADMIN,
    enum: ASSIGNABLE_MEMBER_ROLES,
    description: "New role in the organization. OWNER cannot be assigned here.",
  })
  role!: MembershipRole;
}
