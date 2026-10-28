package expo.modules.protagplayer

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer

/** The last stretch of a sleep timer, over which the music fades out rather than cutting off. */
private const val FADE_MS = 10_000L
private const val FADE_STEP_MS = 100L

/**
 * The sleep timer: pause after a while, or at the end of the song playing.
 * Kept beside the player rather than in JS, so it still goes off when the app
 * has been swiped away and only the playback service is left. Main thread only.
 */
object Sleep {
  private val main = Handler(Looper.getMainLooper())
  private var player: ExoPlayer? = null

  /** When the timer goes off, on `SystemClock.elapsedRealtime`'s clock; null when there's no timer. */
  private var endsAt: Long? = null
  var atEndOfSong = false
    private set

  /** Told whenever the timer is set, turned off, or goes off (the JS module, while there is one). */
  var onChange: (() -> Unit)? = null

  /** Called once, for the one player. */
  fun attach(p: ExoPlayer) {
    player = p
    p.addListener(object : Player.Listener {
      override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
        if (atEndOfSong && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM) off()
      }

      override fun onPlaybackStateChanged(state: Int) {
        // The last song ended (nothing after it): there's nothing left to stop.
        if (atEndOfSong && state == Player.STATE_ENDED) off()
      }
    })
  }

  /** Milliseconds until the timer goes off; null when there's no timer. */
  fun remainingMs(): Long? = endsAt?.let { (it - SystemClock.elapsedRealtime()).coerceAtLeast(0) }

  fun timer(ms: Long) {
    clear()
    endsAt = SystemClock.elapsedRealtime() + ms
    main.postDelayed(fade, (ms - FADE_MS).coerceAtLeast(0))
    onChange?.invoke()
  }

  fun endOfSong() {
    clear()
    atEndOfSong = true
    player?.pauseAtEndOfMediaItems = true
    onChange?.invoke()
  }

  fun off() {
    clear()
    onChange?.invoke()
  }

  private fun clear() {
    main.removeCallbacks(fade)
    endsAt = null
    atEndOfSong = false
    player?.let {
      it.pauseAtEndOfMediaItems = false
      it.volume = 1f
    }
  }

  /** Turns the music down step by step over the last stretch, then pauses. */
  private val fade = object : Runnable {
    override fun run() {
      val p = player
      val left = remainingMs() ?: return
      if (left == 0L || p == null) {
        p?.pause()
        off()
        return
      }
      p.volume = left.toFloat() / FADE_MS
      main.postDelayed(this, FADE_STEP_MS)
    }
  }
}
