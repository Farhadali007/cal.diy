-- VOICERO Calendar Engine (task 2.7): org-level suspension.
-- Adds suspension state to OrganizationSettings. Existing orgs are
-- NOT suspended by default (suspended = false). No data migration:
-- suspendedAt / suspendedReason / suspendedById start NULL.

-- AlterTable
ALTER TABLE "OrganizationSettings" ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrganizationSettings" ADD COLUMN "suspendedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrganizationSettings" ADD COLUMN "suspendedReason" TEXT;

-- AlterTable
ALTER TABLE "OrganizationSettings" ADD COLUMN "suspendedById" INTEGER;
