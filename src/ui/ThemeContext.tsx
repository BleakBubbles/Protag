import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { getSetting, setSetting, SettingKey } from '@/db/settings';

import { palettes, type Palette, type Scheme } from './theme';

/** What the user picked in Settings: follow the phone, or always one scheme. */
export type ThemeChoice = 'system' | Scheme;

const isChoice = (value: string | null): value is ThemeChoice =>
  value === 'system' || value === 'dark' || value === 'light';

interface ThemeValue {
  colors: Palette;
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * The app's palette, dark or light: the phone's own setting unless the user
 * picked one. Renders nothing until the saved choice is read, so the app never
 * opens in the wrong scheme and flips (the splash screen covers the wait).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const system = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice | null>(null);

  useEffect(() => {
    getSetting(db, SettingKey.theme).then(
      (value) => setChoiceState(isChoice(value) ? value : 'system'),
      () => setChoiceState('system')
    );
  }, [db]);

  const setChoice = useCallback(
    (next: ThemeChoice) => {
      setChoiceState(next);
      setSetting(db, SettingKey.theme, next).catch(() => {});
    },
    [db]
  );

  const scheme: Scheme = choice === 'dark' || choice === 'light' ? choice : system === 'light' ? 'light' : 'dark';
  const value = useMemo(() => (choice ? { colors: palettes[scheme], choice, setChoice } : null), [choice, scheme, setChoice]);

  if (!value) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useTheme(): ThemeValue {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('Theme hooks need a ThemeProvider above them');
  return theme;
}

/** The current palette, for colours passed as props (icons, ripples, tints). */
export const useColors = (): Palette => useTheme().colors;

/** The Settings choice and its setter. */
export function useThemeChoice() {
  const { choice, setChoice } = useTheme();
  return { choice, setChoice };
}

/**
 * A component's styles as a function of the palette, built once per palette
 * and shared by every instance, so switching theme rebuilds each sheet once:
 *
 *   const useStyles = makeStyles((colors) => StyleSheet.create({ ... }));
 *   // in the component: const styles = useStyles();
 */
export function makeStyles<T>(build: (colors: Palette) => T): () => T {
  const built = new Map<Palette, T>();
  return function useStyles() {
    const colors = useColors();
    let styles = built.get(colors);
    if (!styles) {
      styles = build(colors);
      built.set(colors, styles);
    }
    return styles;
  };
}
