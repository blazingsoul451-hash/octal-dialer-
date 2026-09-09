package com.octal.dialer.octal_dialer

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.CallLog
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
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
    private val TAG = "OctalCall"
    private val PREFS_NAME = "OctalDialerPrefs"
    private val PREF_KEY_PREFERRED_SIM = "octal_preferred_sim"

    private var pendingResult: MethodChannel.Result? = null
    private var methodChannel: MethodChannel? = null
    private var telephonyManager: TelephonyManager? = null
    private var phoneStateListener: PhoneStateListener? = null
    private var modernTelephonyCallback: Any? = null // Holds TelephonyCallback on API 31+

    // Active call session tracking
    data class ActiveCallSession(
        val callId: String,
        val phoneNumber: String, // Clean digits only
        val rawPhone: String,
        val startedAt: Long,
        val simSlot: Int?,
        val subscriptionId: Int?,
        var userCancelled: Boolean = false,
        var completionSent: Boolean = false,
        var offhookReceived: Boolean = false,
        var offhookAt: Long = 0L
    )

    private val callLock = Any()
    private var currentCall: ActiveCallSession? = null

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
                "getSimInfo" -> {
                    getSimInfo(result)
                }
                "setPreferredSim" -> {
                    val mode = call.argument<String>("mode") ?: "SYSTEM_DEFAULT"
                    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    prefs.edit().putString(PREF_KEY_PREFERRED_SIM, mode).apply()
                    Log.d(TAG, "[OctalCall] SIM_PREFERENCE saved: $mode")
                    result.success(true)
                }
                "makeDirectCall" -> {
                    val phone = call.argument<String>("phone")
                    val callId = call.argument<String>("callId")
                    if (!phone.isNullOrEmpty()) {
                        makeDirectCall(phone, callId, result)
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
                    synchronized(callLock) {
                        currentCall?.let {
                            it.userCancelled = true
                            Log.d(TAG, "[OctalCall] End call requested by user (userCancelled=true) for callId=${it.callId}")
                        }
                    }
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
                    val logGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
                    result.success(callGranted && stateGranted && logGranted)
                }
                "requestCallPermission" -> {
                    val permissionsNeeded = mutableListOf<String>()
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
                        permissionsNeeded.add(Manifest.permission.CALL_PHONE)
                    }
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
                        permissionsNeeded.add(Manifest.permission.READ_PHONE_STATE)
                    }
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
                        permissionsNeeded.add(Manifest.permission.READ_CALL_LOG)
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

        registerTelephonyListeners()
    }

    // ==========================================
    // SIM MANAGEMENT
    // ==========================================
    private fun getSimInfo(result: MethodChannel.Result) {
        try {
            val subManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
            val telecomManager = getSystemService(Context.TELECOM_SERVICE) as? TelecomManager

            val hasReadPhoneState = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
            val activeList: List<SubscriptionInfo> = if (hasReadPhoneState && subManager != null) {
                subManager.activeSubscriptionInfoList ?: emptyList()
            } else emptyList()

            val defaultHandle = telecomManager?.getDefaultOutgoingPhoneAccount(PhoneAccount.SCHEME_TEL)
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val preferredSim = prefs.getString(PREF_KEY_PREFERRED_SIM, "SYSTEM_DEFAULT") ?: "SYSTEM_DEFAULT"

            var defaultSlot: Int? = null
            val sims = activeList.map { info ->
                val slot = info.simSlotIndex
                val subId = info.subscriptionId
                val isDefault = defaultHandle != null && (
                    defaultHandle.id == subId.toString() ||
                    defaultHandle.id.contains(subId.toString())
                )
                if (isDefault) {
                    defaultSlot = slot
                }
                mapOf(
                    "slot" to slot,
                    "subscriptionId" to subId,
                    "displayName" to (info.displayName?.toString() ?: "SIM ${slot + 1}"),
                    "carrierName" to (info.carrierName?.toString() ?: ""),
                    "isDefault" to isDefault
                )
            }

            val response = mapOf(
                "sims" to sims,
                "defaultSimSlot" to defaultSlot,
                "preferredSim" to preferredSim
            )
            Log.d(TAG, "[OctalCall] getSimInfo: count=${sims.size} defaultSlot=$defaultSlot preferred=$preferredSim")
            result.success(response)
        } catch (e: Exception) {
            Log.e(TAG, "[OctalCall] getSimInfo error: ${e.message}")
            result.error("SIM_INFO_ERROR", e.message, null)
        }
    }

    private fun resolvePhoneAccountHandle(): Pair<PhoneAccountHandle?, Pair<Int?, Int?>> {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val preferred = prefs.getString(PREF_KEY_PREFERRED_SIM, "SYSTEM_DEFAULT") ?: "SYSTEM_DEFAULT"
        val telecomManager = getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
        val subManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager

        if (preferred == "SYSTEM_DEFAULT" || subManager == null || telecomManager == null) {
            Log.d(TAG, "[OctalCall] SIM_RESOLUTION: Using Android system default outgoing account")
            return Pair(null, Pair(null, null))
        }

        val targetSlot = preferred.toIntOrNull()
        if (targetSlot == null) {
            return Pair(null, Pair(null, null))
        }

        val hasReadPhoneState = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
        if (!hasReadPhoneState) {
            return Pair(null, Pair(null, null))
        }

        val activeSubs = subManager.activeSubscriptionInfoList ?: emptyList()
        val targetSub = activeSubs.find { it.simSlotIndex == targetSlot }
        if (targetSub == null) {
            Log.w(TAG, "[OctalCall] SIM_RESOLUTION: Preferred SIM slot $targetSlot is not active, falling back to system default")
            return Pair(null, Pair(null, null))
        }

        val callAccounts = telecomManager.getCallCapablePhoneAccounts() ?: emptyList()
        for (handle in callAccounts) {
            if (handle.id == targetSub.subscriptionId.toString() || handle.id.contains(targetSub.subscriptionId.toString())) {
                Log.d(TAG, "[OctalCall] SIM_RESOLUTION: Matched PhoneAccountHandle ${handle.id} for slot $targetSlot (subId=${targetSub.subscriptionId})")
                return Pair(handle, Pair(targetSlot, targetSub.subscriptionId))
            }
        }

        Log.w(TAG, "[OctalCall] SIM_RESOLUTION: No exact PhoneAccountHandle match for subId=${targetSub.subscriptionId}, falling back to system default")
        return Pair(null, Pair(targetSlot, targetSub.subscriptionId))
    }

    // ==========================================
    // CALL INITIATION
    // ==========================================
    private fun makeDirectCall(phone: String, requestedCallId: String?, result: MethodChannel.Result) {
        val cleanPhone = phone.replace(Regex("[^\\d+]"), "")
        if (cleanPhone.isEmpty()) {
            result.error("INVALID_PHONE", "Phone number is empty after sanitization", null)
            return
        }

        val callGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
        val stateGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
        val logGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED

        if (!callGranted || !stateGranted || !logGranted) {
            result.error("CALL_PERMISSION_REQUIRED", "CALL_PHONE, READ_PHONE_STATE, and READ_CALL_LOG permissions are required for direct GSM dialing", null)
            return
        }

        val (explicitHandle, slotAndSub) = resolvePhoneAccountHandle()
        val callId = requestedCallId ?: "call_${System.currentTimeMillis()}"

        val session = ActiveCallSession(
            callId = callId,
            phoneNumber = cleanPhone.filter { it.isDigit() },
            rawPhone = phone,
            startedAt = System.currentTimeMillis(),
            simSlot = slotAndSub.first,
            subscriptionId = slotAndSub.second
        )

        synchronized(callLock) {
            currentCall = session
        }

        val intent = Intent(Intent.ACTION_CALL).apply {
            data = Uri.parse("tel:$cleanPhone")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
            if (explicitHandle != null) {
                putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, explicitHandle)
            }
        }

        try {
            Log.d(TAG, "[OctalCall] CALL_START callId=$callId phone=$cleanPhone handle=${explicitHandle?.id ?: "SYSTEM_DEFAULT"}")
            startActivity(intent)
            result.success(true)
        } catch (e: SecurityException) {
            synchronized(callLock) { currentCall = null }
            Log.e(TAG, "[OctalCall] SecurityException on ACTION_CALL: ${e.message}")
            result.error("SECURITY_EXCEPTION", "Permission denied by system: ${e.message}", null)
        } catch (e: Exception) {
            synchronized(callLock) { currentCall = null }
            Log.e(TAG, "[OctalCall] ACTION_CALL failed: ${e.message}")
            result.error("CALL_FAILED", "Direct call failed: ${e.message}", null)
        }
    }

    // ==========================================
    // TELEPHONY STATE LISTENER
    // ==========================================
    private fun registerTelephonyListeners() {
        try {
            telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                registerModernTelephonyCallback()
            } else {
                registerLegacyPhoneStateListener()
            }
        } catch (e: Exception) {
            Log.e(TAG, "[OctalCall] Failed to register telephony listener: ${e.message}")
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
        val session = synchronized(callLock) { currentCall }

        if (state == TelephonyManager.CALL_STATE_OFFHOOK) {
            session?.let {
                it.offhookReceived = true
                it.offhookAt = System.currentTimeMillis()
            }
            Log.d(TAG, "[OctalCall] TELEPHONY_STATE state=OFFHOOK (dialing/ringing)")
            runOnUiThread {
                methodChannel?.invokeMethod("onCallStateChanged", mapOf("state" to "RINGING"))
            }
        } else if (state == TelephonyManager.CALL_STATE_IDLE) {
            Log.d(TAG, "[OctalCall] TELEPHONY_STATE state=IDLE (call ended)")
            if (session != null && !session.completionSent) {
                startCallLogCorrelation(session)
            }
        }
    }

    // ==========================================
    // CALLLOG CORRELATION WITH BOUNDED POLLING
    // ==========================================
    private data class CallLogMatch(val duration: Int, val date: Long, val number: String)

    private fun startCallLogCorrelation(session: ActiveCallSession) {
        Thread {
            val pollDelays = listOf(150L, 300L, 500L, 800L, 1200L, 1800L, 2500L)
            var match: CallLogMatch? = null

            for (delayMs in pollDelays) {
                try {
                    Thread.sleep(delayMs)
                } catch (_: InterruptedException) {
                    break
                }

                synchronized(callLock) {
                    if (session.completionSent) return@Thread
                }

                match = queryMatchingCallLog(session)
                if (match != null) {
                    Log.d(TAG, "[OctalCall] CALLLOG_MATCH found on poll ${delayMs}ms: duration=${match.duration} date=${match.date}")
                    break
                }
            }

            val elapsedSinceStart = System.currentTimeMillis() - session.startedAt
            val matchedDuration = match?.duration ?: 0

            val reason = when {
                session.userCancelled -> {
                    if (match != null && matchedDuration > 0) {
                        "ANSWERED"
                    } else {
                        "CANCELLED"
                    }
                }
                match != null && matchedDuration > 0 -> {
                    "ANSWERED"
                }
                match != null && matchedDuration == 0 -> {
                    if (elapsedSinceStart >= 28000L) "NO_ANSWER" else "REJECTED"
                }
                else -> {
                    // No CallLog record resolved
                    if (session.userCancelled) "CANCELLED"
                    else if (elapsedSinceStart >= 28000L) "NO_ANSWER"
                    else "NO_ANSWER"
                }
            }

            val finalDuration = if (reason == "ANSWERED") matchedDuration else 0
            sendCallCompletion(session, reason, finalDuration)
        }.start()
    }

    private fun queryMatchingCallLog(session: ActiveCallSession): CallLogMatch? {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "[OctalCall] CALLLOG_QUERY: READ_CALL_LOG not granted")
            return null
        }

        val cleanTarget = session.phoneNumber
        val minDate = session.startedAt - 5000L // 5s clock tolerance
        val projection = arrayOf(
            CallLog.Calls._ID,
            CallLog.Calls.NUMBER,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION,
            CallLog.Calls.TYPE
        )
        val selection = "${CallLog.Calls.TYPE} = ? AND ${CallLog.Calls.DATE} >= ?"
        val selectionArgs = arrayOf(
            CallLog.Calls.OUTGOING_TYPE.toString(),
            minDate.toString()
        )
        val sortOrder = "${CallLog.Calls.DATE} DESC"

        try {
            contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )?.use { cursor ->
                val numberIdx = cursor.getColumnIndex(CallLog.Calls.NUMBER)
                val dateIdx = cursor.getColumnIndex(CallLog.Calls.DATE)
                val durationIdx = cursor.getColumnIndex(CallLog.Calls.DURATION)

                while (cursor.moveToNext()) {
                    val num = if (numberIdx != -1) cursor.getString(numberIdx) ?: "" else ""
                    val date = if (dateIdx != -1) cursor.getLong(dateIdx) else 0L
                    val duration = if (durationIdx != -1) cursor.getInt(durationIdx) else 0
                    val cleanNum = num.filter { it.isDigit() }

                    val isMatch = cleanNum == cleanTarget ||
                        (cleanTarget.length >= 7 && cleanNum.endsWith(cleanTarget.takeLast(7))) ||
                        (cleanNum.length >= 7 && cleanTarget.endsWith(cleanNum.takeLast(7)))

                    if (isMatch) {
                        return CallLogMatch(duration = duration, date = date, number = num)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "[OctalCall] CALLLOG_QUERY error: ${e.message}")
        }
        return null
    }

    private fun sendCallCompletion(session: ActiveCallSession, reason: String, duration: Int) {
        synchronized(callLock) {
            if (session.completionSent) return
            session.completionSent = true
            if (currentCall == session) {
                currentCall = null
            }
        }

        Log.d(TAG, "[OctalCall] COMPLETION_SENT callId=${session.callId} reason=$reason duration=$duration")
        val payload = mapOf(
            "callId" to session.callId,
            "reason" to reason,
            "answered" to (reason == "ANSWERED"),
            "duration" to duration,
            "phoneNumber" to session.rawPhone,
            "simSlot" to session.simSlot,
            "timestamp" to System.currentTimeMillis()
        )

        runOnUiThread {
            methodChannel?.invokeMethod("onCallEnded", payload)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSIONS_REQUEST_CODE) {
            val allGranted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            pendingResult?.success(allGranted)
            pendingResult = null
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
