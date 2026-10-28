package io.github.tahmid1999.punchcard

import android.content.Intent
import android.os.Build
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// FlutterFragmentActivity, not FlutterActivity: BiometricPrompt needs a FragmentActivity.
class MainActivity : FlutterFragmentActivity() {
    private var channel: MethodChannel? = null

    // A pairing link (punchcard://pair?...) that opened the app, kept until Dart asks.
    private var pendingLink: String? = null

    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
        pendingLink = intent?.dataString
        channel = MethodChannel(engine.dartExecutor.binaryMessenger, "punchcard/device").apply {
            setMethodCallHandler { call, result ->
                try {
                    when (call.method) {
                        "hasKey" -> result.success(DeviceKey.exists(call.argument("alias")!!))
                        "createKey" -> result.success(DeviceKey.create(this@MainActivity, call.argument("alias")!!))
                        "deleteKey" -> result.success(DeviceKey.delete(call.argument("alias")!!).let { null })
                        "model" -> result.success("${Build.MANUFACTURER} ${Build.MODEL}")
                        "takeLink" -> result.success(pendingLink.also { pendingLink = null })
                        "sign" -> DeviceKey.sign(
                            this@MainActivity,
                            call.argument<String>("alias")!!,
                            call.argument<String>("message")!!,
                            call.argument<String>("title")!!,
                            call.argument<String>("subtitle")!!,
                        ) { r ->
                            r.fold(
                                { result.success(it) },
                                { e -> result.error((e as? KeyError)?.code ?: "ERROR", e.message, null) },
                            )
                        }
                        else -> result.notImplemented()
                    }
                } catch (e: KeyError) {
                    result.error(e.code, e.message, null)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.dataString?.let { channel?.invokeMethod("link", it) }
    }
}
