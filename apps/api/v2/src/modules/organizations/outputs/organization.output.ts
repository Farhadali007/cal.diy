import { ERROR_STATUS, SUCCESS_STATUS } from "@calcom/platform-constants";
import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { IsBoolean, IsDate, IsEnum, IsInt, IsString, ValidateNested } from "class-validator";

export class OrganizationOutputDto {
  @IsInt()
  @Expose()
  readonly id!: number;

  @IsString()
  @Expose()
  readonly name!: string;

  @IsString()
  @Expose()
  readonly slug!: string;

  @IsString()
  @Expose()
  readonly timeZone!: string;

  @IsBoolean()
  @Expose()
  readonly isOrganization!: boolean;

  @IsDate()
  @Type(() => Date)
  @Expose()
  readonly createdAt!: Date;
}

export class OrganizationOutputResponseDto {
  @Expose()
  @ApiProperty({ example: SUCCESS_STATUS, enum: [SUCCESS_STATUS, ERROR_STATUS] })
  @IsEnum([SUCCESS_STATUS, ERROR_STATUS])
  status!: typeof SUCCESS_STATUS | typeof ERROR_STATUS;

  @Expose()
  @ValidateNested()
  @Type(() => OrganizationOutputDto)
  data!: OrganizationOutputDto;
}
