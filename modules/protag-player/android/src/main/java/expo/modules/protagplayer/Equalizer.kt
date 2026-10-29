package expo.modules.protagplayer

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.audiofx.AudioEffect
import androidx.media3.exoplayer.ExoPlayer

/**
 * The phone's own equalizer (Samsung's, a Pixel's, or an app like Wavelet)
 * rather than one of Protag's: whoever cares about EQ has usually set one up
 * already. Android's audio-effect intents tell it which audio is Protag's.
 */
object Equalizer {
  private fun panel(player: ExoPlayer, context: Context) =
    Intent(AudioEffect.ACTION_DISPLAY_AUDIO_EFFECT_CONTROL_PANEL)
      .putExtra(AudioEffect.EXTRA_AUDIO_SESSION, player.audioSessionId)
      .putExtra(AudioEffect.EXTRA_PACKAGE_NAME, context.packageName)
      .putExtra(AudioEffect.EXTRA_CONTENT_TYPE, AudioEffect.CONTENT_TYPE_MUSIC)

  /** Lets equalizers that apply per app attach to the player's audio; called once, for the one player. */
  fun announce(player: ExoPlayer, context: Context) {
    context.sendBroadcast(
      Intent(AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION)
        .putExtra(AudioEffect.EXTRA_AUDIO_SESSION, player.audioSessionId)
        .putExtra(AudioEffect.EXTRA_PACKAGE_NAME, context.packageName)
        .putExtra(AudioEffect.EXTRA_CONTENT_TYPE, AudioEffect.CONTENT_TYPE_MUSIC)
    )
  }

  fun available(player: ExoPlayer, context: Context) =
    panel(player, context).resolveActivity(context.packageManager) != null

  fun open(player: ExoPlayer, activity: Activity) {
    // The panel expects to be started for a result; Protag has nothing to do with it.
    activity.startActivityForResult(panel(player, activity), 0)
  }
}
