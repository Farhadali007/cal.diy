import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateOrganizationSuspensionInputDto {
  @IsBoolean()
  @ApiProperty({
    description: "true to suspend the organization, false to resume it.",
    example: true,
  })
  suspended!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    description: "Human-readable reason shown to admins. Required when suspending; ignored when resuming.",
    example: "Payment overdue — suspending bookings until the account is settled.",
    required: false,
  })
  reason?: string;
}
