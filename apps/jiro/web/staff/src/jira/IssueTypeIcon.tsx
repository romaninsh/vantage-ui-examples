// Jira's work-type mark: a 16px coloured tile with a white glyph.
import type { ComponentType } from "react";
import type { NewCoreIconProps } from "@atlaskit/icon";
import BugIcon from "@atlaskit/icon/core/bug";
import EpicIcon from "@atlaskit/icon/core/epic";
import StoryIcon from "@atlaskit/icon/core/story";
import SubtasksIcon from "@atlaskit/icon/core/subtasks";
import TaskIcon from "@atlaskit/icon/core/task";
import Tile from "@atlaskit/tile";
import type { TileProps } from "@atlaskit/tile";
import { token } from "@atlaskit/tokens";
import { TYPE_LABELS, type IssueType } from "./issueFields";

const LOOK: Record<IssueType, { icon: ComponentType<NewCoreIconProps>; color: TileProps["backgroundColor"] }> = {
  epic: { icon: EpicIcon, color: "color.background.accent.purple.bolder" },
  story: { icon: StoryIcon, color: "color.background.accent.green.bolder" },
  task: { icon: TaskIcon, color: "color.background.accent.blue.bolder" },
  bug: { icon: BugIcon, color: "color.background.accent.red.bolder" },
  "sub-task": { icon: SubtasksIcon, color: "color.background.accent.blue.bolder" },
};

export function IssueTypeIcon({ type }: { type: IssueType | null }) {
  const look = LOOK[type ?? "task"];
  const Icon = look.icon;
  return (
    <Tile size="xxsmall" backgroundColor={look.color} label={TYPE_LABELS[type ?? "task"]}>
      <Icon label="" color={token("color.icon.inverse")} size="small" />
    </Tile>
  );
}
