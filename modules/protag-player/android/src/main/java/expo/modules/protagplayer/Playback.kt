package expo.modules.protagplayer

import android.content.Context
import android.net.Uri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

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
  @Volatile var memo: String? = null

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
      .also { p ->
        player = p
        p.addListener(SavedQueue.placeKeeper(context.applicationContext, p))
      }
}

fun mediaItem(track: Track): MediaItem =
  MediaItem.Builder()
    .setMediaId(track.id)
    .setUri(track.uri)
    .setMediaMetadata(
      MediaMetadata.Builder()
        .setTitle(track.title)
        .setArtist(track.artist)
        .setAlbumTitle(track.album)
        // Media3 loads content:// album art itself, for the notification, lock screen and car.
        .setArtworkUri(track.artwork?.let(Uri::parse))
        .setIsPlayable(true)
        .setIsBrowsable(false)
        .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
        .build()
    )
    .build()

/**
 * The last play order and where it was, kept on disk so playback can pick up
 * after the app is gone: Android's media resumption (the play button on
 * headphones, in the car, or on the media controls after a restart) asks the
 * service for it.
 */
object SavedQueue {
  private const val FILE = "protag-queue.json"
  private const val PREFS = "protag-playback"
  private val io = Executors.newSingleThreadExecutor()

  class Saved(val memo: String, val tracks: List<Track>, val index: Int, val positionMs: Long, val repeat: Int)

  fun saveOrder(context: Context, tracks: List<Track>, memo: String) {
    val list = JSONArray()
    for (t in tracks) {
      list.put(
        JSONObject()
          .put("id", t.id).put("uri", t.uri).put("title", t.title)
          .put("artist", t.artist).put("album", t.album).put("artwork", t.artwork)
      )
    }
    val text = JSONObject().put("memo", memo).put("tracks", list).toString()
    val file = File(context.filesDir, FILE)
    io.execute { runCatching { file.writeText(text) } }
  }

  /** Keeps where playback is: on every pause, song change and repeat change. */
  fun placeKeeper(context: Context, player: Player) = object : Player.Listener {
    fun save() {
      if (player.mediaItemCount == 0) return
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putInt("index", player.currentMediaItemIndex)
        .putLong("positionMs", player.currentPosition)
        .putInt("repeat", player.repeatMode)
        .apply()
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) = save()
    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) = save()
    override fun onRepeatModeChanged(repeatMode: Int) = save()
  }

  /** Off the main thread: the file can hold a whole library's worth of songs. */
  fun load(context: Context): Saved? = runCatching {
    val json = JSONObject(File(context.filesDir, FILE).readText())
    val list = json.getJSONArray("tracks")
    val tracks = (0 until list.length()).map { i ->
      val o = list.getJSONObject(i)
      Track().apply {
        id = o.getString("id")
        uri = o.getString("uri")
        title = o.getString("title")
        artist = o.optString("artist").takeIf { o.has("artist") && !o.isNull("artist") }
        album = o.optString("album").takeIf { o.has("album") && !o.isNull("album") }
        artwork = o.optString("artwork").takeIf { o.has("artwork") && !o.isNull("artwork") }
      }
    }
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val index = prefs.getInt("index", 0)
    if (tracks.isEmpty() || index !in tracks.indices) return@runCatching null
    Saved(json.getString("memo"), tracks, index, prefs.getLong("positionMs", 0), prefs.getInt("repeat", Player.REPEAT_MODE_OFF))
  }.getOrNull()
}
