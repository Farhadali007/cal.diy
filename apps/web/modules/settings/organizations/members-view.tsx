"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { getPlaceholderAvatar } from "@calcom/lib/defaultAvatarImage";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { MembershipRole } from "@calcom/prisma/enums";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Alert } from "@calcom/ui/components/alert";
import { Avatar } from "@calcom/ui/components/avatar";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { ConfirmationDialogContent, Dialog } from "@calcom/ui/components/dialog";
import { Select } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { revalidateSettingsOrgMembers } from "app/cache/path/settings/organizations";
import { useSession } from "next-auth/react";
import { useState } from "react";

type OrgMember = RouterOutputs["viewer"]["organizations"]["listMembers"][number];
type RoleOption = { value: MembershipRole; label: string; isDisabled?: boolean };

const MemberRow = ({ member, isCurrentUser }: { member: OrgMember; isCurrentUser: boolean }) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

  const updateRoleMutation = trpc.viewer.organizations.updateMemberRole.useMutation({
    onSuccess: async () => {
      await utils.viewer.organizations.listMembers.invalidate();
      revalidateSettingsOrgMembers();
      showToast(t("member_role_updated"), "success");
    },
    onError: (error) => {
      showToast(error.message || t("error_updating_member"), "error");
    },
  });

  const removeMemberMutation = trpc.viewer.organizations.removeMember.useMutation({
    onSuccess: async () => {
      await utils.viewer.organizations.listMembers.invalidate();
      revalidateSettingsOrgMembers();
      showToast(t("member_removed"), "success");
    },
    onError: (error) => {
      showToast(error.message || t("error_removing_member"), "error");
    },
  });

  const roleOptions: RoleOption[] = [
    { value: MembershipRole.MEMBER, label: t("member") },
    { value: MembershipRole.ADMIN, label: t("admin") },
    // OWNER can never be assigned; it is shown (disabled) only so the current
    // role of an OWNER renders in the select.
    { value: MembershipRole.OWNER, label: t("owner"), isDisabled: true },
  ];

  const displayName = member.user.name ?? member.user.email;

  return (
    <div className="flex flex-wrap items-center gap-3 border-subtle border-b px-4 py-3 last:border-b-0 sm:flex-nowrap sm:px-6">
      <Avatar
        size="md"
        imageSrc={getPlaceholderAvatar(member.user.avatarUrl, member.user.name)}
        alt={displayName}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-default text-sm">{displayName}</p>
          {isCurrentUser && (
            <Badge variant="gray" className="text-xs">
              {t("you")}
            </Badge>
          )}
          {!member.accepted && (
            <Badge variant="orange" className="text-xs">
              {t("pending")}
            </Badge>
          )}
        </div>
        <p className="truncate text-sm text-subtle">{member.user.email}</p>
      </div>
      <div className="w-36">
        <Select<RoleOption>
          aria-label={t("role")}
          options={roleOptions}
          value={roleOptions.find((option) => option.value === member.role)}
          isLoading={updateRoleMutation.isPending}
          onChange={(option) => {
            if (option && option.value !== member.role) {
              updateRoleMutation.mutate({ memberUserId: member.userId, role: option.value });
            }
          }}
        />
      </div>
      <Button
        color="minimal"
        variant="icon"
        StartIcon="trash"
        title={t("remove_member")}
        onClick={() => setRemoveDialogOpen(true)}
      />
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <ConfirmationDialogContent
          variety="danger"
          title={t("remove_member_confirm_title")}
          confirmBtnText={t("remove_member")}
          loadingText={t("remove_member")}
          isPending={removeMemberMutation.isPending}
          onConfirm={() => {
            removeMemberMutation.mutate({ memberUserId: member.userId });
            setRemoveDialogOpen(false);
          }}>
          <div className="mt-2">
            <p className="text-subtle text-sm">
              {t("remove_member_confirm_description", { name: displayName })}
            </p>
          </div>
        </ConfirmationDialogContent>
      </Dialog>
    </div>
  );
};

const MembersView = ({ members }: { members: OrgMember[] }) => {
  const { t } = useLocale();
  const session = useSession();
  const currentUserId = session.data?.user?.id;

  return (
    <SettingsHeader
      title={t("members")}
      description={t("organization_members_description")}
      borderInShellHeader={true}>
      <div className="border-subtle rounded-b-lg border border-t-0">
        <div className="border-subtle border-b px-4 py-4 sm:px-6">
          <Alert severity="info" message={t("new_members_added_from_voicero")} />
        </div>
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            isCurrentUser={member.userId === currentUserId}
          />
        ))}
      </div>
    </SettingsHeader>
  );
};

export default MembersView;
