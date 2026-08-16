package com.octal.dialer.octal_dialer

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import android.telephony.PhoneStateListener
import android.content.Context
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

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        
        val channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
        methodChannel = channel
        
        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "getDeviceInfo" -> {
                    val info = mapOf(
                        "model" to android.os.Build.MODEL,
                        "manufacturer" to android.os.Build.MANUFACTURER,
                        "os" to "Android " + android.os.Build.VERSION.RELEASE
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
                "endCall" -> {
                    try {
                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                            val telecomManager = getSystemService(Context.TELECOM_SERVICE) as TelecomManager
                            @Suppress("DEPRECATION")
                            val ended = telecomManager.endCall()
                            result.success(ended)
                        } else {
                            // Pre-Pie: no reliable programmatic hangup without system permissions
                            result.success(false)
                        }
                    } catch (e: SecurityException) {
                        // Expected on Android 9+ if app is not the default dialer
                        result.success(false)
                    } catch (e: Exception) {
                        result.error("END_CALL_ERROR", e.message, null)
                    }
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
                    
                    if (permissionsNeeded.isNotEmpty()) {
                        pendingResult = result
                        ActivityCompat.requestPermissions(this, permissionsNeeded.toTypedArray(), PERMISSIONS_REQUEST_CODE)
                    } else {
                        result.success(true)
                    }
                }
                else -> {
                    result.notImplemented()
                }
            }
        }

        registerPhoneStateListener()
    }

    private fun registerPhoneStateListener() {
        try {
            telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            phoneStateListener = object : PhoneStateListener() {
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    super.onCallStateChanged(state, phoneNumber)
                    val stateString = when (state) {
                        TelephonyManager.CALL_STATE_IDLE -> "IDLE"
                        TelephonyManager.CALL_STATE_OFFHOOK -> "OFFHOOK"
                        TelephonyManager.CALL_STATE_RINGING -> "RINGING"
                        else -> "UNKNOWN"
                    }
                    runOnUiThread {
                        methodChannel?.invokeMethod("onCallStateChanged", stateString)
                    }
                }
            }
            telephonyManager?.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE)
        } catch (e: Exception) {
            // Log or handle error silently
        }
    }

    private fun makeDirectCall(phone: String, result: MethodChannel.Result) {
        val cleanPhone = phone.replace(Regex("[^\\d+]"), "")
        
        val callGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
        val stateGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED

        if (callGranted && stateGranted) {
            val intent = Intent(Intent.ACTION_CALL).apply {
                data = Uri.parse("tel:$cleanPhone")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            try {
                startActivity(intent)
                result.success(true)
            } catch (e: Exception) {
                val dialIntent = Intent(Intent.ACTION_DIAL).apply {
                    data = Uri.parse("tel:$cleanPhone")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(dialIntent)
                result.success(false)
            }
        } else {
            pendingCallPhone = cleanPhone
            pendingResult = result
            
            val permissionsNeeded = mutableListOf<String>()
            if (!callGranted) permissionsNeeded.add(Manifest.permission.CALL_PHONE)
            if (!stateGranted) permissionsNeeded.add(Manifest.permission.READ_PHONE_STATE)
            
            ActivityCompat.requestPermissions(this, permissionsNeeded.toTypedArray(), PERMISSIONS_REQUEST_CODE)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSIONS_REQUEST_CODE) {
            val allGranted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            
            if (allGranted) {
                val phone = pendingCallPhone
                if (phone != null) {
                    val intent = Intent(Intent.ACTION_CALL).apply {
                        data = Uri.parse("tel:$phone")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    try {
                        startActivity(intent)
                        pendingResult?.success(true)
                    } catch (e: Exception) {
                        pendingResult?.error("CALL_ERROR", e.message, null)
                    }
                } else {
                    pendingResult?.success(true)
                }
            } else {
                val phone = pendingCallPhone
                if (phone != null) {
                    val dialIntent = Intent(Intent.ACTION_DIAL).apply {
                        data = Uri.parse("tel:$phone")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    startActivity(dialIntent)
                }
                pendingResult?.success(false)
            }
            pendingCallPhone = null
            pendingResult = null
        }
    }

    override fun onDestroy() {
        // Clean up listener to prevent leaks
        try {
            telephonyManager?.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE)
        } catch (e: Exception) {}
        super.onDestroy()
    }
}
