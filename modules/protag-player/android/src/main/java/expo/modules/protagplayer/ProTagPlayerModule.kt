package expo.modules.protagplayer

import android.content.ComponentName
import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** A song in a play order, with what the lock screen, notification and car show for it. */
class Track : Record {
  @Field var id: String = ""
  @Field var uri: String = ""
  @Field var title: String = ""
  @Field var artist: String? = null
  @Field var album: String? = null
  @Field var artwork: String? = null
}

/** How often the position is reported while playing, for the seek bar. */
private const val TICK_MS = 500L

/** Unplayable songs in a row skipped past before giving up (a whole order of missing files, on repeat). */
private const val MAX_SKIPPED_ERRORS = 10

/**
 * ProTag's playback engine: one ExoPlayer holding the whole play order, so
 * songs run on gaplessly and the lock screen, headphones and car can skip
 * through it without JS. JS owns the order (queue.ts) and hands it over;
 * changes the player makes by itself come back as `onMoved` / `onEnded`.
 *
 * Every function runs on the main thread, where the player lives.
 */
class ProTagPlayerModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var player: ExoPlayer? = null
  private var controller: ListenableFuture<MediaController>? = null

  /** The index JS last put playback at or was told about; any other move is reported. */
  private var reported = C.INDEX_UNSET
  private var skippedErrors = 0

  private val tick = object : Runnable {
    override fun run() {
      sendStatus()
      if (player?.isPlaying == true) main.postDelayed(this, TICK_MS)
    }
  }

  private val listener = object : Player.Listener {
    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
      val p = player ?: return
      val index = p.currentMediaItemIndex
      // A song ending into the next, a lock-screen skip, repeat going round.
      val repeated = reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT
      if (index == reported && !repeated) return
      reported = index
      sendEvent("onMoved", mapOf("index" to index, "repeated" to repeated))
    }

    override fun onPlaybackStateChanged(state: Int) {
      if (state == Player.STATE_READY) skippedErrors = 0
      if (state == Player.STATE_ENDED) sendEvent("onEnded", mapOf<String, Any?>())
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
      main.removeCallbacks(tick)
      if (isPlaying) main.postDelayed(tick, TICK_MS)
    }

    override fun onPlayerError(error: PlaybackException) {
      // A missing or broken file shouldn't stop the music: say so, and move on.
      val p = player ?: return
      sendStatus()
      if (skippedErrors >= MAX_SKIPPED_ERRORS || !p.hasNextMediaItem()) return
      skippedErrors++
      p.seekToNextMediaItem()
      p.prepare()
    }

    override fun onEvents(player: Player, events: Player.Events) {
      if (events.containsAny(
          Player.EVENT_PLAYBACK_STATE_CHANGED,
          Player.EVENT_PLAY_WHEN_READY_CHANGED,
          Player.EVENT_IS_PLAYING_CHANGED,
          Player.EVENT_MEDIA_ITEM_TRANSITION,
          Player.EVENT_POSITION_DISCONTINUITY,
          Player.EVENT_TIMELINE_CHANGED
        )
      ) sendStatus()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ProTagPlayer")

    Events("onStatus", "onMoved", "onEnded", "onSleep")

    OnCreate {
      Sleep.onChange = { sendEvent("onSleep", sleepState()) }
    }

    OnDestroy {
      main.post {
        Sleep.onChange = null
        main.removeCallbacks(tick)
        player?.removeListener(listener)
        controller?.let { MediaController.releaseFuture(it) }
      }
    }

    /**
     * Hand over a whole play order and start at `index`, `positionMs` in.
     * `memo` is JS's own note on the order, kept with it and handed back by
     * `restore`.
     */
    AsyncFunction("setQueue") { tracks: List<Track>, index: Int, positionMs: Double, autoplay: Boolean, repeat: String, memo: String ->
      val p = ready()
      Playback.memo = memo
      reported = index
      p.repeatMode = repeatMode(repeat)
      p.setMediaItems(tracks.map(::mediaItem), index, positionMs.toLong())
      p.prepare()
      p.playWhenReady = autoplay
      SavedQueue.saveOrder(p.context(), p, memo)
      sendStatus()
    }.runOnQueue(Queues.MAIN)

    /**
     * A new order around the song that's playing (shuffle changed): it plays
     * on untouched while the songs before and after it are swapped, so
     * there's no gap. Falls back to a fresh start if it isn't that song.
     */
    AsyncFunction("reorder") { tracks: List<Track>, index: Int, memo: String ->
      val p = ready()
      Playback.memo = memo
      val current = p.currentMediaItemIndex
      reported = index
      if (p.mediaItemCount == 0 || p.currentMediaItem?.mediaId != tracks.getOrNull(index)?.id) {
        val wasPlaying = p.playWhenReady
        p.setMediaItems(tracks.map(::mediaItem), index, p.currentPosition)
        p.prepare()
        p.playWhenReady = wasPlaying
      } else {
        p.removeMediaItems(current + 1, p.mediaItemCount)
        p.removeMediaItems(0, current)
        p.addMediaItems(0, tracks.subList(0, index).map(::mediaItem))
        p.addMediaItems(tracks.subList(index + 1, tracks.size).map(::mediaItem))
      }
      SavedQueue.saveOrder(p.context(), p, memo)
      sendStatus()
    }.runOnQueue(Queues.MAIN)

    /** Songs queued into the order at `at` (Add to queue); the song playing plays on. */
    AsyncFunction("insert") { tracks: List<Track>, at: Int, memo: String ->
      val p = ready()
      Playback.memo = memo
      p.addMediaItems(at.coerceIn(0, p.mediaItemCount), tracks.map(::mediaItem))
      reported = p.currentMediaItemIndex
      SavedQueue.saveOrder(p.context(), p, memo)
      sendStatus()
    }.runOnQueue(Queues.MAIN)

    /** An upcoming song moved from `from` to `to` in the order. */
    AsyncFunction("move") { from: Int, to: Int, memo: String ->
      val p = ready()
      val current = p.currentMediaItemIndex
      if (from <= current || to <= current || from >= p.mediaItemCount || to >= p.mediaItemCount) return@AsyncFunction
      Playback.memo = memo
      p.moveMediaItem(from, to)
      SavedQueue.saveOrder(p.context(), p, memo)
      sendStatus()
    }.runOnQueue(Queues.MAIN)

    /** An upcoming song taken out of the order. */
    AsyncFunction("remove") { at: Int, memo: String ->
      val p = ready()
      if (at <= p.currentMediaItemIndex || at >= p.mediaItemCount) return@AsyncFunction
      Playback.memo = memo
      p.removeMediaItem(at)
      SavedQueue.saveOrder(p.context(), p, memo)
      sendStatus()
    }.runOnQueue(Queues.MAIN)

    /**
     * What's already playing, for JS starting up again while the player
     * carried on without it (the app swiped away mid-song, then reopened):
     * the memo of the order it holds, where it is, and its repeat mode.
     * Null when there's nothing.
     */
    AsyncFunction("restore") {
      val memo = Playback.memo
      if (!Playback.exists() || memo == null) return@AsyncFunction null
      val p = ready()
      if (p.mediaItemCount == 0) return@AsyncFunction null
      reported = p.currentMediaItemIndex
      sendStatus()
      mapOf(
        "memo" to memo,
        "index" to p.currentMediaItemIndex,
        "repeat" to when (p.repeatMode) {
          Player.REPEAT_MODE_ALL -> "all"
          Player.REPEAT_MODE_ONE -> "one"
          else -> "off"
        }
      )
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("skipTo") { index: Int, autoplay: Boolean ->
      val p = ready()
      reported = index
      p.seekTo(index, 0)
      if (p.playbackState == Player.STATE_IDLE) p.prepare()
      if (autoplay) p.play()
      sendStatus()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("play") {
      val p = ready()
      if (p.playbackState == Player.STATE_IDLE) p.prepare()
      if (p.playbackState == Player.STATE_ENDED) p.seekTo(p.currentMediaItemIndex, 0)
      p.play()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("pause") {
      player?.pause()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("seekTo") { positionMs: Double ->
      val p = player ?: return@AsyncFunction
      p.seekTo(positionMs.toLong().coerceAtLeast(0))
      sendStatus()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setRepeat") { repeat: String ->
      player?.repeatMode = repeatMode(repeat)
    }.runOnQueue(Queues.MAIN)

    /** The sleep timer: `"timer"` pauses in `ms` (fading out), `"end-of-song"` after the song playing, `"off"` cancels. */
    AsyncFunction("setSleep") { mode: String, ms: Double ->
      ready()
      when (mode) {
        "timer" -> Sleep.timer(ms.toLong())
        "end-of-song" -> Sleep.endOfSong()
        else -> Sleep.off()
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getSleep") {
      sleepState()
    }.runOnQueue(Queues.MAIN)

    /** Whether the phone has an equalizer ProTag can open. */
    AsyncFunction("hasEqualizer") {
      val p = ready()
      Equalizer.available(p, p.context())
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("openEqualizer") {
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      Equalizer.open(ready(), activity)
    }.runOnQueue(Queues.MAIN)
  }

  /**
   * The player, listened to, with the playback service running: connecting a
   * controller is what starts the service and puts the session in front of
   * the notification and lock screen.
   */
  private fun ready(): ExoPlayer {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val p = player ?: Playback.player(context).also {
      it.addListener(listener)
      player = it
    }
    if (controller == null) {
      val future = MediaController.Builder(context, SessionToken(context, ComponentName(context, PlaybackService::class.java)))
        .setListener(object : MediaController.Listener {
          // The service went away (stopped while paused); the next command brings it back.
          override fun onDisconnected(controller: MediaController) {
            this@ProTagPlayerModule.controller = null
          }
        })
        .buildAsync()
      future.addListener({
        if (runCatching { future.get() }.isFailure && controller === future) controller = null
      }, MoreExecutors.directExecutor())
      controller = future
    }
    return p
  }

  private fun ExoPlayer.context() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun sendStatus() {
    val p = player ?: return
    val state = p.playbackState
    val duration = p.duration
    sendEvent(
      "onStatus",
      mapOf(
        "loaded" to (p.mediaItemCount > 0 && state != Player.STATE_IDLE),
        // What the play button shows: meant to be playing, even while it buffers between songs.
        "playing" to (p.playWhenReady && (state == Player.STATE_READY || state == Player.STATE_BUFFERING)),
        "buffering" to (state == Player.STATE_BUFFERING),
        "positionMs" to p.currentPosition.toDouble(),
        "durationMs" to (if (duration == C.TIME_UNSET) 0.0 else duration.toDouble()),
        "index" to p.currentMediaItemIndex,
        "error" to p.playerError?.let { it.message ?: it.errorCodeName }
      )
    )
  }

  private fun sleepState() = mapOf(
    "mode" to when {
      Sleep.atEndOfSong -> "end-of-song"
      Sleep.remainingMs() != null -> "timer"
      else -> "off"
    },
    "remainingMs" to Sleep.remainingMs()?.toDouble()
  )

  private fun repeatMode(repeat: String) = when (repeat) {
    "all" -> Player.REPEAT_MODE_ALL
    "one" -> Player.REPEAT_MODE_ONE
    else -> Player.REPEAT_MODE_OFF
  }
}
