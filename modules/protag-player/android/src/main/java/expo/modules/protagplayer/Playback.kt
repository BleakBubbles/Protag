package expo.modules.protagplayer

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.exoplayer.ExoPlayer

/**
 * The one player in the app, shared by the JS module (which drives it) and
 * `PlaybackService` (which shows it to the lock screen, notification,
 * headphones and car). Both run on the main thread of the same process, so
 * the module calls it directly and every change is in place by the time a
 * call returns.
 */
object Playback {
  private var player: ExoPlayer? = null

  /** JS's note on the order the player holds (see the module's `restore`). */
  var memo: String? = null

  fun exists() = player != null

  fun player(context: Context): ExoPlayer =
    player ?: ExoPlayer.Builder(context.applicationContext)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(C.USAGE_MEDIA)
          .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
          .build(),
        // Pauses for calls and other apps' audio, and ducks for notifications.
        true
      )
      // Headphones unplugged or Bluetooth gone: pause rather than play out loud.
      .setHandleAudioBecomingNoisy(true)
      .setWakeMode(C.WAKE_MODE_LOCAL)
      .build()
      .also { player = it }
}
