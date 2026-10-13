// Jira's priority arrows: red pointing up, amber for medium, blue pointing down.
import type { ComponentType } from "react";
import type { NewCoreIconProps } from "@atlaskit/icon";
import PriorityHighIcon from "@atlaskit/icon/core/priority-high";
import PriorityHighestIcon from "@atlaskit/icon/core/priority-highest";
import PriorityLowIcon from "@atlaskit/icon/core/priority-low";
import PriorityLowestIcon from "@atlaskit/icon/core/priority-lowest";
import PriorityMediumIcon from "@atlaskit/icon/core/priority-medium";
import { token } from "@atlaskit/tokens";
import { PRIORITY_LABELS, type IssuePriority } from "./issueFields";

const LOOK: Record<IssuePriority, { icon: ComponentType<NewCoreIconProps>; color: string }> = {
  highest: { icon: PriorityHighestIcon, color: token("color.icon.danger") },
  high: { icon: PriorityHighIcon, color: token("color.icon.danger") },
  medium: { icon: PriorityMediumIcon, color: token("color.icon.warning") },
  low: { icon: PriorityLowIcon, color: token("color.icon.information") },
  lowest: { icon: PriorityLowestIcon, color: token("color.icon.information") },
};

export function PriorityIcon({ priority }: { priority: IssuePriority | null }) {
  if (!priority) return null;
  const { icon: Icon, color } = LOOK[priority];
  return <Icon label={`Priority: ${PRIORITY_LABELS[priority]}`} color={color as NewCoreIconProps["color"]} />;
}
