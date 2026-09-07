package com.octal.dialer.octal_dialer

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.view.WindowManager
import androidx.annotation.RequiresApi
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.octal.dialer/call"
    private val PERMISSIONS_REQUEST_CODE = 1001
    private var pendingCallPhone: String? = null
    private var pendingResult: MethodChannel.Result? = null
    
    private var methodChannel: MethodChannel? = null
    private var telephonyManager: TelephonyManager? = null
    private var phoneStateListener: PhoneStateListener? = null
    private var modernTelephonyCallback: Any? = null // Holds TelephonyCallback on API 31+

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        
        val channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
        methodChannel = channel
        
        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "getDeviceInfo" -> {
                    val info = mapOf(
                        "model" to Build.MODEL,
                        "manufacturer" to Build.MANUFACTURER,
                        "os" to "Android " + Build.VERSION.RELEASE,
                        "sdkInt" to Build.VERSION.SDK_INT
                    )
                    result.success(info)
                }
                "makeDirectCall" -> {
                    val phone = call.argument<String>("phone")
                    if (!phone.isNullOrEmpty()) {
                        makeDirectCall(phone, result)
                    } else {
                        result.error("INVALID_PHONE", "Phone number is empty", null)
                    }
                }
                "answerCall" -> {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            val telecomManager = getSystemService(Context.TELECOM_SERVICE) as TelecomManager
                            @Suppress("DEPRECATION")
                            telecomManager.acceptRingingCall()
                            result.success(true)
                        } else {
                            result.error("UNSUPPORTED", "Answering calls programmatically requires Android 8.0+", null)
                        }
                    } catch (e: SecurityException) {
                        result.error("SECURITY_EXCEPTION", "Permission denied: ${e.message}", null)
                    } catch (e: Exception) {
                        result.error("ANSWER_ERROR", e.message, null)
                    }
                }
                "endCall" -> {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            val telecomManager = getSystemService(Context.TELECOM_SERVICE) as TelecomManager
                            @Suppress("DEPRECATION")
                            val ended = telecomManager.endCall()
                            result.success(ended)
                        } else {
                            result.success(false)
                        }
                    } catch (e: SecurityException) {
                        result.success(false)
                    } catch (e: Exception) {
                        result.error("END_CALL_ERROR", e.message, null)
                    }
                }
                "startForegroundService" -> {
                    val status = call.argument<String>("status") ?: "Phone Link active."
                    OctalForegroundService.startService(this, status)
                    result.success(true)
                }
                "updateServiceStatus" -> {
                    val status = call.argument<String>("status") ?: "Connected"
                    OctalForegroundService.updateStatus(this, status)
                    result.success(true)
                }
                "stopForegroundService" -> {
                    OctalForegroundService.stopService(this)
                    result.success(true)
                }
                "keepScreenOn" -> {
                    val enable = call.argument<Boolean>("enable") ?: false
                    if (enable) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    }
                    result.success(true)
                }
                "bringToForeground" -> {
                    try {
                        val intent = Intent(context, MainActivity::class.java).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                        }
                        startActivity(intent)
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("FOREGROUND_ERROR", e.message, null)
                    }
                }
                "checkCallPermission" -> {
                    val callGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
                    val stateGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
                    result.success(callGranted && stateGranted)
                }
                "requestCallPermission" -> {
                    val permissionsNeeded = mutableListOf<String>()
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
                        permissionsNeeded.add(Manifest.permission.CALL_PHONE)
                    }
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
                        permissionsNeeded.add(Manifest.permission.READ_PHONE_STATE)
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ANSWER_PHONE_CALLS) != PackageManager.PERMISSION_GRANTED) {
                            permissionsNeeded.add(Manifest.permission.ANSWER_PHONE_CALLS)
                        }
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                            permissionsNeeded.add(Manifest.permission.POST_NOTIFICATIONS)
                        }
                    }
                    
                    if (permissionsNeeded.isNotEmpty()) {
                        if (pendingResult != null) {
                            result.success(false)
                            return@setMethodCallHandler
                        }
                        pendingResult = result
                        ActivityCompat.requestPermissions(this, permissionsNeeded.toTypedArray(), PERMISSIONS_REQUEST_CODE)
                    } else {
                        result.success(true)
                    }
                }
                "isBatteryOptimizationIgnored" -> {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                            result.success(powerManager.isIgnoringBatteryOptimizations(packageName))
                        } else {
                            result.success(true)
                        }
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                "requestBatteryOptimization" -> {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                            if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                    data = Uri.parse("package:$packageName")
                                }
                                startActivity(intent)
                                result.success(true)
                            } else {
                                result.success(true)
                            }
                        } else {
                            result.success(true)
                        }
                    } catch (e: Exception) {
                        try {
                            val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                            startActivity(fallbackIntent)
                            result.success(true)
                        } catch (ex: Exception) {
                            result.error("BATTERY_OPT_ERROR", ex.message, null)
                        }
                    }
                }
                else -> {
                    result.notImplemented()
                }
            }
        }

        registerTelephonyListeners()
    }

    private fun registerTelephonyListeners() {
        try {
            telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Modern Android 12+ (API 31+) TelephonyCallback
                registerModernTelephonyCallback()
            } else {
                // Legacy PhoneStateListener for older Android
                registerLegacyPhoneStateListener()
            }
        } catch (e: Exception) {
            // Log or handle silently
        }
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun registerModernTelephonyCallback() {
        val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
            override fun onCallStateChanged(state: Int) {
                handleCallStateChange(state, null)
            }
        }
        modernTelephonyCallback = callback
        telephonyManager?.registerTelephonyCallback(mainExecutor, callback)
    }

    @Suppress("DEPRECATION")
    private fun registerLegacyPhoneStateListener() {
        phoneStateListener = object : PhoneStateListener() {
            override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                super.onCallStateChanged(state, phoneNumber)
                handleCallStateChange(state, phoneNumber)
            }
        }
        telephonyManager?.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE)
    }

    private fun handleCallStateChange(state: Int, phoneNumber: String?) {
        val stateString = when (state) {
            TelephonyManager.CALL_STATE_IDLE -> "IDLE"
            TelephonyManager.CALL_STATE_OFFHOOK -> "OFFHOOK"
            TelephonyManager.CALL_STATE_RINGING -> "RINGING"
            else -> "UNKNOWN"
        }
        val payload = mapOf(
            "state" to stateString,
            "phoneNumber" to (phoneNumber ?: "")
        )
        runOnUiThread {
            methodChannel?.invokeMethod("onCallStateChanged", payload)
        }
    }

    private fun makeDirectCall(phone: String, result: MethodChannel.Result) {
        val cleanPhone = phone.replace(Regex("[^\\d+]"), "")
        if (cleanPhone.isEmpty()) {
            result.error("INVALID_PHONE", "Phone number is empty after sanitization", null)
            return
        }

        val callGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
        val stateGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED

        if (!callGranted || !stateGranted) {
            result.error("CALL_PERMISSION_REQUIRED", "CALL_PHONE and READ_PHONE_STATE permissions are required for direct GSM dialing", null)
            return
        }

        val intent = Intent(Intent.ACTION_CALL).apply {
            data = Uri.parse("tel:$cleanPhone")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        
        try {
            startActivity(intent)
            result.success(true)
        } catch (e: SecurityException) {
            result.error("SECURITY_EXCEPTION", "Permission denied by system: ${e.message}", null)
        } catch (e: Exception) {
            result.error("CALL_FAILED", "Direct call failed: ${e.message}", null)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSIONS_REQUEST_CODE) {
            val callGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
            val stateGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
            pendingResult?.success(callGranted && stateGranted)
            pendingResult = null
            pendingCallPhone = null
        }
    }

    override fun onDestroy() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (modernTelephonyCallback as? TelephonyCallback)?.let {
                    telephonyManager?.unregisterTelephonyCallback(it)
                }
            } else {
                telephonyManager?.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE)
            }
        } catch (e: Exception) {}
        super.onDestroy()
    }
}
