import { MembershipRole } from "@calcom/prisma/enums";
import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";

export class OrganizationMemberUserDto {
  @Expose()
  @ApiProperty({ example: 42 })
  id!: number;

  @Expose()
  @ApiProperty({ example: "staff@acme-dental.com" })
  email!: string;

  @Expose()
  @ApiProperty({ example: "Dana Staff", nullable: true })
  name!: string | null;

  @Expose()
  @ApiProperty({ example: "dana-staff", nullable: true })
  username!: string | null;
}

export class OrganizationMemberDto {
  @Expose()
  @ApiProperty({ example: 7 })
  id!: number;

  @Expose()
  @ApiProperty({ example: 42 })
  userId!: number;

  @Expose()
  @ApiProperty({ enum: MembershipRole, example: MembershipRole.MEMBER })
  role!: MembershipRole;

  @Expose()
  @ApiProperty({ example: true })
  accepted!: boolean;

  @Expose()
  @ApiProperty({ example: "2026-11-23T00:00:00.000Z" })
  createdAt!: Date;

  @Expose()
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
