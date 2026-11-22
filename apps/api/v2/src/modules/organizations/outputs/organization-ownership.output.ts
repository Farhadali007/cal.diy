import { ERROR_STATUS, SUCCESS_STATUS } from "@calcom/platform-constants";
import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { IsDate, IsEnum, IsInt, IsString, ValidateNested } from "class-validator";

export class ManagedOrganizationSummaryDto {
  @IsInt()
  @Expose()
  readonly id!: number;

  @IsString()
  @Expose()
  readonly name!: string;

  @IsString()
  @Expose()
  readonly slug!: string;
}

export class ManagedOrganizationLinkDto {
  @IsInt()
  @Expose()
  readonly managerOrganizationId!: number;

  @IsInt()
  @Expose()
  readonly managedOrganizationId!: number;

  @IsDate()
  @Type(() => Date)
  @Expose()
  readonly createdAt!: Date;

  @Expose()
  @ValidateNested()
  @Type(() => ManagedOrganizationSummaryDto)
  readonly managedOrganization!: ManagedOrganizationSummaryDto;
}

export class ManagedOrganizationLinkResponseDto {
  @Expose()
  @ApiProperty({ example: SUCCESS_STATUS, enum: [SUCCESS_STATUS, ERROR_STATUS] })
  @IsEnum([SUCCESS_STATUS, ERROR_STATUS])
  status!: typeof SUCCESS_STATUS | typeof ERROR_STATUS;

  @Expose()
  @ValidateNested()
  @Type(() => ManagedOrganizationLinkDto)
  data!: ManagedOrganizationLinkDto;
}

export class ManagedOrganizationLinksResponseDto {
  @Expose()
  @ApiProperty({ example: SUCCESS_STATUS, enum: [SUCCESS_STATUS, ERROR_STATUS] })
  @IsEnum([SUCCESS_STATUS, ERROR_STATUS])
  status!: typeof SUCCESS_STATUS | typeof ERROR_STATUS;

  @Expose()
  @ValidateNested({ each: true })
  @Type(() => ManagedOrganizationLinkDto)
  data!: ManagedOrganizationLinkDto[];
}
