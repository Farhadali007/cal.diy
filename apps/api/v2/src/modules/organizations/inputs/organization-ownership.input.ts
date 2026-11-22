import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Min } from "class-validator";

export class LinkManagedOrganizationInputDto {
  @IsInt()
  @Min(1)
  @ApiProperty({
    description: "ID of the organization to manage (the business org). Must already exist and be unmanaged.",
    example: 12,
  })
  managedOrganizationId!: number;
}
