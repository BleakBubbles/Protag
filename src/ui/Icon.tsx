import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

/**
 * ProTag's own icons, drawn from another icon set where Ionicons' version
 * didn't suit. The tag: Ionicons' is thin and angular; this one is rounder and
 * sturdier. The menu actions likewise: Ionicons' outlines read spindly at a
 * menu's small size. Changing a glyph here changes it everywhere.
 */
const OWN = {
  tag: 'tag-outline',
  'tag-filled': 'tag',
  tags: 'tag-multiple-outline',
  'tags-filled': 'tag-multiple',
  edit: 'pencil-outline',
  rename: 'format-letter-case',
  delete: 'trash-can-outline',
  'move-to': 'folder-move-outline',
  'save-mix': 'bookmark-outline',
  restore: 'restore',
  'add-to-queue': 'playlist-plus',
} as const satisfies Record<string, ComponentProps<typeof MaterialCommunityIcons>['name']>;

type OwnIconName = keyof typeof OWN;

/** Any Ionicons name, or one of ProTag's own (`tag`, `tags` and their `-filled` forms; the menu actions). */
export type IconName = ComponentProps<typeof Ionicons>['name'] | OwnIconName;

export interface IconProps {
  name: IconName;
  size: number;
  color: ColorValue;
}

/** An icon by name, from whichever set it belongs to. */
export function Icon({ name, size, color }: IconProps) {
  // The icons draw as text, which takes any colour React Native does; their types are just narrower.
  const tint = (color ?? undefined) as string | undefined;
  if (name in OWN) return <MaterialCommunityIcons name={OWN[name as OwnIconName]} size={size} color={tint} />;
  return <Ionicons name={name as ComponentProps<typeof Ionicons>['name']} size={size} color={tint} />;
}
