import { Image } from 'react-native';

/** The mark's proportions (see MARK_BOUNDS in scripts/make-icons.mjs). */
const ASPECT = 416 / 280;

export interface LogoMarkProps {
  width: number;
  /** Draws the mark as a silhouette in this colour. Without one, it's teal (`accentFg`), as on the splash screen. */
  color?: string;
}

/** The ProTag mark (the half-note P), recoloured to fit wherever it's shown. */
export function LogoMark({ width, color }: LogoMarkProps) {
  return (
    <Image
      source={require('../../assets/logo-mark.png')}
      style={{ width, height: width * ASPECT, tintColor: color }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}
