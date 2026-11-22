"use server";

import { revalidatePath } from "next/cache";

export async function revalidateSettingsOrgProfile() {
  revalidatePath("/settings/organizations/profile");
}

export async function revalidateSettingsOrgGeneral() {
  revalidatePath("/settings/organizations/general");
}

export async function revalidateSettingsOrgMembers() {
  revalidatePath("/settings/organizations/members");
}

export async function revalidateSettingsOrgManagedOrganizations() {
  revalidatePath("/settings/organizations/managed-organizations");
}
