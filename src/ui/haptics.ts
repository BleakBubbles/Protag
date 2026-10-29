import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';

/**
 * The tick for a press-and-hold taking effect: a mix card's menu, a song
 * starting a selection, the divider picked up to resize. Every hold feels the
 * same, so the hand learns it.
 */
export function feelHold(): void {
  performAndroidHapticsAsync(AndroidHaptics.Long_Press).catch(() => {});
}

/** How long a press-and-hold takes: quicker than Android's default half second, which felt sluggish. */
export const HOLD_MS = 350;

/** The tick for a slider landing on a new stop as it's dragged: the sleep timer's bar. */
export function feelStep(): void {
  performAndroidHapticsAsync(AndroidHaptics.Clock_Tick).catch(() => {});
}
