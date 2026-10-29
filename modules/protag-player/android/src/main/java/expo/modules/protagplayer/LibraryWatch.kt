package expo.modules.protagplayer

import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore

/** How long the index stays quiet before a change is reported: a download or a copy is a burst of changes. */
private const val SETTLE_MS = 2_000L

/**
 * Noticing songs arrive, leave or change on the phone, so the library keeps
 * up without a rescan by hand. Android indexes every audio file (MediaStore);
 * this watches that index, not the files.
 *
 * The watch says only that something in the index may have changed (other
 * media's changes reach it too), so JS compares `stamp`s before scanning.
 */
object LibraryWatch {
  private val main = Handler(Looper.getMainLooper())
  private var observer: ContentObserver? = null
  private val settled = Runnable { onChange?.invoke() }

  var onChange: (() -> Unit)? = null

  fun start(context: Context) {
    if (observer != null) return
    val o = object : ContentObserver(main) {
      override fun onChange(selfChange: Boolean, uri: Uri?) {
        main.removeCallbacks(settled)
        main.postDelayed(settled, SETTLE_MS)
      }
    }
    context.contentResolver.registerContentObserver(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, true, o)
    observer = o
  }

  fun stop(context: Context) {
    observer?.let { context.contentResolver.unregisterContentObserver(it) }
    observer = null
    main.removeCallbacks(settled)
  }

  /**
   * A fingerprint of the phone's audio files: how many, the newest, and the
   * latest change to any. A song added, removed or retagged moves it; nothing
   * else does. Null without permission to read audio.
   *
   * One pass over two numbers a file, a few milliseconds for thousands of songs.
   */
  fun stamp(context: Context): String? {
    val projection = arrayOf(MediaStore.Audio.Media._ID, MediaStore.Audio.Media.DATE_MODIFIED)
    val cursor = try {
      context.contentResolver.query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, projection, null, null, null)
    } catch (e: SecurityException) {
      null
    } ?: return null
    var count = 0
    var newest = 0L
    var changed = 0L
    cursor.use {
      while (it.moveToNext()) {
        count++
        newest = maxOf(newest, it.getLong(0))
        changed = maxOf(changed, it.getLong(1))
      }
    }
    // The index's own version moves when it's rebuilt from scratch, which can reuse ids.
    val version = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) MediaStore.getVersion(context) else ""
    return "$version:$count:$newest:$changed"
  }
}
