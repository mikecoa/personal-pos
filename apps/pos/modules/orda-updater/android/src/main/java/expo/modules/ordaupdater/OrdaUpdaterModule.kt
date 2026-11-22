package expo.modules.ordaupdater

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * In-app updates for sideloaded builds: download the new APK (checking its SHA-256) and hand it
 * to Android's package installer. Android always shows its own confirmation; this can't and
 * doesn't try to install silently.
 */
class OrdaUpdaterModule : Module() {
  private val context get() = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "App is not ready", null)

  override fun definition() = ModuleDefinition {
    Name("OrdaUpdater")
    Events("onProgress")

    Function("installedVersion") {
      val info = context.packageManager.getPackageInfo(context.packageName, 0)
      val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
      mapOf("versionCode" to code, "versionName" to (info.versionName ?: ""))
    }

    Function("canInstall") {
      Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()
    }

    Function("openInstallSettings") {
      val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("download") { url: String, sha256: String ->
      // https only; plain http is allowed just for the emulator's own computer when testing.
      val host = Uri.parse(url).host ?: ""
      if (!url.startsWith("https://") && host !in setOf("10.0.2.2", "localhost", "127.0.0.1")) throw CodedException("BAD_URL", "Updates must come over https", null)
      val dir = File(context.cacheDir, "updates").apply { mkdirs() }
      dir.listFiles()?.forEach { it.delete() }                     // keep only the newest download
      val out = File(dir, "orda-update.apk")
      val conn = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 15_000; readTimeout = 30_000; instanceFollowRedirects = true
      }
      try {
        if (conn.responseCode !in 200..299) throw CodedException("HTTP_${conn.responseCode}", "Download failed (${conn.responseCode})", null)
        val total = conn.contentLengthLong
        val digest = MessageDigest.getInstance("SHA-256")
        var received = 0L
        var lastSent = 0L
        conn.inputStream.use { input ->
          out.outputStream().use { output ->
            val buf = ByteArray(64 * 1024)
            while (true) {
              val n = input.read(buf)
              if (n < 0) break
              output.write(buf, 0, n)
              digest.update(buf, 0, n)
              received += n
              if (received - lastSent > 256 * 1024 || received == total) {
                lastSent = received
                sendEvent("onProgress", mapOf("received" to received, "total" to total))
              }
            }
          }
        }
        val hex = digest.digest().joinToString("") { "%02x".format(it) }
        if (sha256.isNotBlank() && !hex.equals(sha256, ignoreCase = true)) {
          out.delete()
          throw CodedException("BAD_FILE", "The download was damaged. Try again.", null)
        }
        out.absolutePath
      } finally {
        conn.disconnect()
      }
    }

    Function("install") { path: String ->
      val file = File(path)
      if (!file.exists()) throw CodedException("NO_FILE", "Download the update first", null)
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.ordaupdates", file)
      val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }
}
