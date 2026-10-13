// A referenced person's avatar with the initials the API serves. Rows carry
// the person's name, so the avatar shows straight away; the initials follow
// once the person's record has loaded.
import type { LazyReference } from "@vantage-ui/client";
import { observer, useRecord } from "@vantage-ui/client/react";
import type { Users } from "../vantage.gen";
import { UserAvatar } from "./UserAvatar";

type Props = {
  person: LazyReference<Users>;
  name: string | null;
  size?: "xsmall" | "small" | "medium";
};

export const PersonAvatar = observer(function PersonAvatar({ person, name, size }: Props) {
  const record = useRecord(person);
  return <UserAvatar name={name} initials={record.value?.initials} size={size} />;
});
