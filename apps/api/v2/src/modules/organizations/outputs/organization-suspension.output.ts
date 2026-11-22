import { ERROR_STATUS, SUCCESS_STATUS } from "@calcom/platform-constants";
import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, ValidateNested } from "class-validator";

export class OrganizationSuspensionDto {
  @IsInt()
  @Expose()
  readonly organizationId!: number;

  @IsBoolean()
  @Expose()
  readonly suspended!: boolean;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  @Expose()
  readonly suspendedAt!: Date | null;

  @IsOptional()
  @IsString()
  @Expose()
  readonly suspendedReason!: string | null;

  @IsOptional()
  @IsInt()
  @Expose()
  readonly suspendedById!: number | null;
}

export class OrganizationSuspensionResponseDto {
  @ApiProperty({ example: SUCCESS_STATUS })
  @IsEnum([SUCCESS_STATUS, ERROR_STATUS])
  status!: typeof SUCCESS_STATUS | typeof ERROR_STATUS;

  @Expose()
  @ValidateNested()
  @Type(() => OrganizationSuspensionDto)
  data!: OrganizationSuspensionDto;
}
