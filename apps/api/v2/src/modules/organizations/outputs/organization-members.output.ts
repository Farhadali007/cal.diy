import { MembershipRole } from "@calcom/prisma/enums";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class OrganizationMemberUserDto {
  @ApiProperty({ example: 42 })
  id!: number;

  @ApiProperty({ example: "staff@acme-dental.com" })
  email!: string;

  @ApiProperty({ example: "Dana Staff", nullable: true })
  name!: string | null;

  @ApiProperty({ example: "dana-staff", nullable: true })
  username!: string | null;
}

export class OrganizationMemberDto {
  @ApiProperty({ example: 7 })
  id!: number;

  @ApiProperty({ example: 42 })
  userId!: number;

  @ApiProperty({ enum: MembershipRole, example: MembershipRole.MEMBER })
  role!: MembershipRole;

  @ApiProperty({ example: true })
  accepted!: boolean;

  @ApiProperty({ example: "2026-11-23T00:00:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ type: OrganizationMemberUserDto })
  @Type(() => OrganizationMemberUserDto)
  user!: OrganizationMemberUserDto;
}

export class OrganizationMemberResponseDto {
  @ApiProperty({ example: "success" })
  status!: string;

  @ApiProperty({ type: OrganizationMemberDto })
  data!: OrganizationMemberDto;
}

export class OrganizationMembersResponseDto {
  @ApiProperty({ example: "success" })
  status!: string;

  @ApiProperty({ type: [OrganizationMemberDto] })
  data!: OrganizationMemberDto[];
}
