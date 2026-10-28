import ProTagPlayer from '../../modules/protag-player';

/** Whether the phone has an equalizer to open (its own, or an app like Wavelet). */
export const hasEqualizer = () => ProTagPlayer.hasEqualizer().catch(() => false);

/** Opens the phone's equalizer, set to ProTag's audio. */
export const openEqualizer = () => ProTagPlayer.openEqualizer().catch(() => {});
