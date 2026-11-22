import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

/**
 * Slug rule for organizations: lowercase letters, digits, single hyphens
 * between segments. Mirrors the username/slug conventions used across the
 * web app (no shared slug regex exists in the codebase to reuse).
 */
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateOrganizationInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @ApiProperty({
    description: "Display name of the organization.",
    example: "Acme Dental Practice",
  })
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(ORGANIZATION_SLUG_PATTERN, {
    message:
      "slug must be lowercase letters, digits and single hyphens, starting and ending with a letter or digit",
  })
  @ApiProperty({
    description:
      "URL slug of the organization. Unique across organizations (parentId is null for orgs, so the @@unique([slug, parentId]) constraint scopes uniqueness to orgs).",
    example: "acme-dental",
  })
  slug!: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description: "IANA time zone of the organization. Defaults to the database default when omitted.",
    example: "Europe/London",
  })
  timeZone?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description:
      'Domain used to derive member usernames from emails (e.g. "acme.com"). Optional; empty means no auto-accept domain. Only affects username derivation, never grants access on its own.',
    example: "acme.com",
  })
  orgAutoAcceptEmail?: string;

  @IsObject()
  @IsOptional()
  @ApiPropertyOptional({
    description:
      "Free-form JSON metadata stored on the organization (e.g. external-system mapping ids). VOICERO stores its agency/business mapping here.",
    example: { voiceroBusinessId: 42 },
  })
  metadata?: Record<string, unknown>;
}
