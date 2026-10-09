import { colors, headerTitleStyle } from './theme';

/** Header and background styling shared by every stack, so nested stacks match the root. */
export const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.text,
  headerTitleStyle,
  contentStyle: { backgroundColor: colors.bg },
};
