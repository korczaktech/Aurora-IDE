package com.korczaktech.aurora

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

private const val API_BASE_URL = "https://api.aurora.korczaktech.com.br"
private const val APK_MIME_TYPE = "application/vnd.android.package-archive"

private data class AppUpdate(
    val version: String,
    val downloadUrl: String,
    val releaseNotes: String?
)

class MainActivity : ComponentActivity() {
    private var availableUpdate by mutableStateOf<AppUpdate?>(null)
    private var downloadId: Long = -1L
    private var pendingInstallUri: Uri? = null

    private val downloadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
            val completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            if (completedId != downloadId) return

            val manager = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
            val uri = manager.getUriForDownloadedFile(completedId)
            if (uri == null) {
                Toast.makeText(this@MainActivity, "Não foi possível baixar a atualização.", Toast.LENGTH_LONG).show()
                return
            }
            installApk(uri)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        ContextCompat.registerReceiver(
            this,
            downloadReceiver,
            IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_EXPORTED
        )

        setContent {
            MaterialTheme(
                colorScheme = MaterialTheme.colorScheme.copy(
                    primary = Color(0xFF1B8A55),
                    secondary = Color(0xFF78D6A2),
                    background = Color(0xFF080B09),
                    surface = Color(0xFF101713),
                    onBackground = Color(0xFFE8F1EB),
                    onSurface = Color(0xFFE8F1EB)
                )
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF080B09)
                ) {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("Aurora", style = MaterialTheme.typography.headlineLarge, color = Color(0xFFE8F1EB))
                        Text("Korczak Technologies", color = Color(0xFF78D6A2))
                    }
                }

                availableUpdate?.let { update ->
                    AlertDialog(
                        onDismissRequest = { },
                        title = { Text("Atualização disponível") },
                        text = {
                            Column {
                                Text("Uma nova versão do Aurora está disponível: ${update.version}.")
                                update.releaseNotes?.takeIf { it.isNotBlank() }?.let {
                                    Text(it, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        },
                        confirmButton = {
                            Button(onClick = {
                                availableUpdate = null
                                downloadAndInstall(update)
                            }) {
                                Text("Instalar")
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = {
                                availableUpdate = null
                                finish()
                            }) {
                                Text("Sair")
                            }
                        }
                    )
                }
            }
        }

        lifecycleScope.launch {
            availableUpdate = withContext(Dispatchers.IO) { checkForUpdate() }
        }
    }

    override fun onResume() {
        super.onResume()
        pendingInstallUri?.let { uri ->
            if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O ||
                packageManager.canRequestPackageInstalls()
            ) {
                pendingInstallUri = null
                launchInstaller(uri)
            }
        }
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(downloadReceiver) }
        super.onDestroy()
    }

    private fun checkForUpdate(): AppUpdate? {
        val currentVersion = BuildConfig.VERSION_NAME
        val url = URL(
            "$API_BASE_URL/app/update?platform=android&current_version=$currentVersion"
        )
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8_000
            readTimeout = 8_000
            setRequestProperty("Accept", "application/json")
        }

        return try {
            if (connection.responseCode !in 200..299) return null
            val response = connection.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(response)
            if (!json.optBoolean("update_available") || !json.optBoolean("installable")) {
                return null
            }

            val apk = json.optJSONObject("apk") ?: return null
            val downloadUrl = apk.optString("download_url").takeIf { it.startsWith("https://") } ?: return null
            AppUpdate(
                version = json.optString("latest_version", "nova versão"),
                downloadUrl = downloadUrl,
                releaseNotes = json.optString("release_notes").takeIf { it.isNotBlank() && it != "null" }
            )
        } catch (_: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }

    private fun downloadAndInstall(update: AppUpdate) {
        runCatching {
            val request = DownloadManager.Request(Uri.parse(update.downloadUrl))
                .setTitle("Atualização do Aurora")
                .setDescription("Baixando a versão ${update.version}")
                .setMimeType(APK_MIME_TYPE)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(false)
                .setDestinationInExternalFilesDir(
                    this,
                    Environment.DIRECTORY_DOWNLOADS,
                    "Aurora-update.apk"
                )

            val manager = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
            downloadId = manager.enqueue(request)
            Toast.makeText(this, "Baixando atualização…", Toast.LENGTH_LONG).show()
        }.onFailure {
            Toast.makeText(this, "Falha ao iniciar o download da atualização.", Toast.LENGTH_LONG).show()
        }
    }

    private fun installApk(uri: Uri) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O &&
            !packageManager.canRequestPackageInstalls()
        ) {
            pendingInstallUri = uri
            val settingsIntent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:$packageName")
            )
            startActivity(settingsIntent)
            return
        }
        launchInstaller(uri)
    }

    private fun launchInstaller(uri: Uri) {
        val installIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, APK_MIME_TYPE)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { startActivity(installIntent) }
            .onFailure {
                Toast.makeText(this, "O Android não conseguiu abrir o instalador.", Toast.LENGTH_LONG).show()
            }
    }
}
