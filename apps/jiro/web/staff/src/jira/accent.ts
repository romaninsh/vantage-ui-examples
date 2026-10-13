import { token } from "@atlaskit/tokens";

/** Bold accent backgrounds that keep white (`color.text.inverse`) text readable. */
const ACCENTS = [
  token("color.background.accent.blue.bolder"),
  token("color.background.accent.teal.bolder"),
  token("color.background.accent.green.bolder"),
  token("color.background.accent.purple.bolder"),
  token("color.background.accent.magenta.bolder"),
  token("color.background.accent.orange.bolder"),
  token("color.background.accent.red.bolder"),
  token("color.background.accent.gray.bolder"),
];

/** An accent picked by hashing `text`, so the same name always gets the same colour. */
export function accentOf(text: string): string {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[hash % ACCENTS.length]!;
}
