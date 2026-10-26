package expo.modules.protagplayer

import android.app.PendingIntent
import android.content.Context
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture

/**
 * Puts the player in front of everything outside the app: the media
 * notification, lock screen, headphone and Bluetooth buttons, and Android
 * Auto. Media3 keeps it in the foreground while music plays.
 *
 * A library service rather than a plain session service, because that's
 * what Android Auto looks for. It has nothing to browse yet: Auto shows
 * what's playing and its controls.
 */
class PlaybackService : MediaLibraryService() {
  private var session: MediaLibrarySession? = null

  override fun onCreate() {
    super.onCreate()
    val builder = MediaLibrarySession.Builder(this, Playback.player(this), Library(this))
    // Tapping the notification opens the app.
    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      builder.setSessionActivity(
        PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      )
    }
    session = builder.build()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

  override fun onDestroy() {
    // The player outlives the service (it's the app's), so only the session goes.
    session?.release()
    session = null
    super.onDestroy()
  }

  private class Library(private val context: Context) : MediaLibrarySession.Callback {
    /**
     * No ±10 s seek buttons anywhere outside the app: offered them, Android
     * Auto (and some lock screens) show those instead of previous / next.
     */
    override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult =
      MediaSession.ConnectionResult.AcceptedResultBuilder(session)
        .setAvailablePlayerCommands(
          MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS.buildUpon()
            .remove(Player.COMMAND_SEEK_BACK)
            .remove(Player.COMMAND_SEEK_FORWARD)
            .build()
        )
        .build()

    /**
     * Play pressed with nothing loaded: on headphones or in the car after the
     * app was gone, or on the media controls Android keeps after a restart.
     * The last order picks up where it was.
     */
    override fun onPlaybackResumption(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      isForPlayback: Boolean
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
      val player = mediaSession.player
      val future = SettableFuture.create<MediaSession.MediaItemsWithStartPosition>()
      Thread {
        val saved = SavedQueue.load(context)
        if (saved == null) {
          future.setException(UnsupportedOperationException("Nothing to resume"))
          return@Thread
        }
        if (isForPlayback) {
          Playback.memo = saved.memo
          ContextCompat.getMainExecutor(context).execute { player.repeatMode = saved.repeat }
        }
        future.set(MediaSession.MediaItemsWithStartPosition(saved.tracks.map(::mediaItem), saved.index, saved.positionMs))
      }.start()
      return future
    }

    override fun onGetLibraryRoot(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      params: LibraryParams?
    ): ListenableFuture<LibraryResult<MediaItem>> {
      val root = MediaItem.Builder()
        .setMediaId(ROOT)
        .setMediaMetadata(
          MediaMetadata.Builder()
            .setTitle("ProTag")
            .setIsBrowsable(true)
            .setIsPlayable(false)
            .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
            .build()
        )
        .build()
      return Futures.immediateFuture(LibraryResult.ofItem(root, params))
    }

    override fun onGetChildren(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      parentId: String,
      page: Int,
      pageSize: Int,
      params: LibraryParams?
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> =
      Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.of(), params))
  }

  private companion object {
    const val ROOT = "root"
  }
}
