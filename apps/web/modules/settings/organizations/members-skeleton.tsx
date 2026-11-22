"use client";

import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import {
  SkeletonAvatar,
  SkeletonContainer,
  SkeletonText,
} from "@calcom/ui/components/skeleton";

export const SkeletonLoader = () => {
  const { t } = useLocale();
  return (
    <SettingsHeader
      title={t("members")}
      description={t("organization_members_description")}
      borderInShellHeader={true}>
      <SkeletonContainer>
        <div className="border-subtle stack-y-6 rounded-b-lg border border-t-0 px-4 py-8">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center gap-3">
              <SkeletonAvatar className="h-10 w-10" />
              <SkeletonText className="h-8 flex-1" />
            </div>
          ))}
        </div>
      </SkeletonContainer>
    </SettingsHeader>
  );
};
