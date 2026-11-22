import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class CreateOrganizationScheduleInputDto {
  @IsInt()
  @Min(1)
  @ApiProperty({
    description: "ID of the org member (usually the managed user created at provisioning) the schedule belongs to.",
    example: 42,
  })
  userId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @ApiProperty({
    description: "IANA timezone for the default schedule (e.g. Europe/Berlin). Must be a valid IANA zone.",
    example: "Europe/Berlin",
  })
  timeZone!: string;
}

export class CreateOrganizationEventTypeInputDto {
  @IsInt()
  @Min(1)
  @ApiProperty({
    description: "ID of the org member (usually the managed user created at provisioning) who owns the event type.",
    example: 42,
  })
  userId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @ApiProperty({ description: "Display title of the event type.", example: "Consultation" })
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @ApiProperty({
    description: "URL slug of the event type, unique per owner. Lowercase letters, numbers, and hyphens.",
    example: "consultation",
  })
  slug!: string;

  @IsInt()
  @Min(1)
  @ApiProperty({ description: "Length of the event in minutes.", example: 30 })
  length!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ApiProperty({ description: "Optional description shown on the booking page.", required: false })
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiProperty({
    description:
      "ID of the schedule to use. Must belong to the same user; when omitted, the user's default schedule is used.",
    required: false,
    example: 7,
  })
  scheduleId?: number;
}
