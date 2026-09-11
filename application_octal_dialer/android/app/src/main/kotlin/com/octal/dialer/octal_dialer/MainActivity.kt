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
    private val PREF_KEY_SUB_ID = "octal_sim_sub_id"
    private val PREF_KEY_SLOT_INDEX = "octal_sim_slot_index"
    private val PREF_KEY_CARD_ID = "octal_sim_card_id"
    private val PREF_KEY_HANDLE_ID = "octal_sim_handle_id"
    private val PREF_KEY_DISPLAY_NAME = "octal_sim_display_name"
    private val PREF_KEY_CARRIER_NAME = "octal_sim_carrier_name"
    private val PREF_KEY_CONFIGURED = "octal_sim_configured"

    data class SimDescriptor(
        val subscriptionId: Int,
        val simSlotIndex: Int, // 0 for SIM 1, 1 for SIM 2
        val cardId: Int,
        val handleId: String?,
        val displayName: String,
        val carrierName: String,
        val isSystemDefault: Boolean
    )

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
                    val subId = call.argument<Int>("subscriptionId")
                    val slot = call.argument<Int>("simSlotIndex")
                    val mode = call.argument<String>("mode")
                    val (descriptors, _, _) = getActiveSimsWithReconciliation()
                    val target = descriptors.find {
                        (subId != null && it.subscriptionId == subId) ||
                        (slot != null && it.simSlotIndex == slot)
                    } ?: descriptors.find {
                        mode != null && it.simSlotIndex.toString() == mode
                    }

                    if (target != null) {
                        saveSimPreferenceInternal(target)
                        result.success(true)
                    } else {
                        Log.w(TAG, "[OctalCall] setPreferredSim: target SIM not found (subId=$subId, slot=$slot, mode=$mode)")
                        result.success(false)
                    }
                }
                "makeDirectCall" -> {
                    val phone = call.argument<String>("phone")
                    val callId = call.argument<String>("callId")
                    val simSlot = call.argument<Int>("simSlot")
                    if (!phone.isNullOrEmpty()) {
                        makeDirectCall(phone, callId, simSlot, result)
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
    private fun saveSimPreferenceInternal(sim: SimDescriptor) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putInt(PREF_KEY_SUB_ID, sim.subscriptionId)
            .putInt(PREF_KEY_SLOT_INDEX, sim.simSlotIndex)
            .putInt(PREF_KEY_CARD_ID, sim.cardId)
            .putString(PREF_KEY_HANDLE_ID, sim.handleId ?: "")
            .putString(PREF_KEY_CARRIER_NAME, sim.carrierName)
            .putString(PREF_KEY_DISPLAY_NAME, sim.displayName)
            .putBoolean(PREF_KEY_CONFIGURED, true)
            .putString(PREF_KEY_PREFERRED_SIM, sim.simSlotIndex.toString())
            .apply()
        Log.d(TAG, "[OctalCall] SIM_PREFERENCE saved: slot=${sim.simSlotIndex} subId=${sim.subscriptionId} carrier=${sim.carrierName}")
    }

    private fun getActiveSimsWithReconciliation(): Triple<List<SimDescriptor>, SimDescriptor?, Boolean> {
        val subManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
        val telecomManager = getSystemService(Context.TELECOM_SERVICE) as? TelecomManager

        val hasReadPhoneState = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
        val activeList: List<SubscriptionInfo> = if (hasReadPhoneState && subManager != null) {
            subManager.activeSubscriptionInfoList ?: emptyList()
        } else emptyList()

        val callAccounts = telecomManager?.getCallCapablePhoneAccounts() ?: emptyList()
        val defaultVoiceSubId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            SubscriptionManager.getDefaultVoiceSubscriptionId()
        } else {
            SubscriptionManager.INVALID_SUBSCRIPTION_ID
        }
        val defaultHandle = telecomManager?.getDefaultOutgoingPhoneAccount(PhoneAccount.SCHEME_TEL)

        val descriptors = activeList.map { info ->
            val subId = info.subscriptionId
            val slot = info.simSlotIndex
            val cardId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) info.cardId else -1

            val matchedHandle = callAccounts.find { handle ->
                handle.id == subId.toString() || handle.id.contains(subId.toString())
            } ?: if (defaultHandle != null && (defaultHandle.id == subId.toString() || defaultHandle.id.contains(subId.toString()))) defaultHandle else null

            val isSysDefault = (defaultVoiceSubId != SubscriptionManager.INVALID_SUBSCRIPTION_ID && defaultVoiceSubId == subId) ||
                    (defaultHandle != null && matchedHandle != null && defaultHandle == matchedHandle) ||
                    (defaultHandle != null && (defaultHandle.id == subId.toString() || defaultHandle.id.contains(subId.toString())))

            SimDescriptor(
                subscriptionId = subId,
                simSlotIndex = slot,
                cardId = cardId,
                handleId = matchedHandle?.id,
                displayName = info.displayName?.toString() ?: "SIM ${slot + 1}",
                carrierName = info.carrierName?.toString() ?: "",
                isSystemDefault = isSysDefault
            )
        }

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val isConfigured = prefs.getBoolean(PREF_KEY_CONFIGURED, false)
        val savedSubId = prefs.getInt(PREF_KEY_SUB_ID, -1)
        val savedCardId = prefs.getInt(PREF_KEY_CARD_ID, -1)
        val savedSlot = prefs.getInt(PREF_KEY_SLOT_INDEX, -1)
        val savedHandleId = prefs.getString(PREF_KEY_HANDLE_ID, null)

        var effectiveSim: SimDescriptor? = null

        if (isConfigured && descriptors.isNotEmpty()) {
            effectiveSim = descriptors.find { it.subscriptionId == savedSubId }
                ?: (if (savedCardId != -1) descriptors.find { it.cardId == savedCardId } else null)
                ?: (if (!savedHandleId.isNullOrEmpty()) descriptors.find { it.handleId == savedHandleId } else null)
                ?: descriptors.find { it.simSlotIndex == savedSlot }
        }

        var needsUserSelection = false

        if (effectiveSim != null) {
            saveSimPreferenceInternal(effectiveSim)
        } else {
            val systemDefaultSim = descriptors.find { it.isSystemDefault }
            if (systemDefaultSim != null) {
                Log.d(TAG, "[OctalCall] Reconcile: adopted Android default outgoing SIM slot=${systemDefaultSim.simSlotIndex} (subId=${systemDefaultSim.subscriptionId})")
                saveSimPreferenceInternal(systemDefaultSim)
                effectiveSim = systemDefaultSim
                needsUserSelection = false
            } else if (descriptors.size == 1) {
                val singleSim = descriptors[0]
                Log.d(TAG, "[OctalCall] Reconcile: single SIM detected, adopting slot=${singleSim.simSlotIndex}")
                saveSimPreferenceInternal(singleSim)
                effectiveSim = singleSim
                needsUserSelection = false
            } else if (descriptors.size > 1) {
                Log.d(TAG, "[OctalCall] Reconcile: Dual SIM with no system default -> prompt user once")
                needsUserSelection = true
            }
        }

        return Triple(descriptors, effectiveSim, needsUserSelection)
    }

    private fun getSimInfo(result: MethodChannel.Result) {
        try {
            val (descriptors, effectiveSim, needsSelection) = getActiveSimsWithReconciliation()

            val sims = descriptors.map { desc ->
                mapOf(
                    "slot" to desc.simSlotIndex,
                    "subscriptionId" to desc.subscriptionId,
                    "cardId" to desc.cardId,
                    "displayName" to desc.displayName,
                    "carrierName" to desc.carrierName,
                    "isDefault" to desc.isSystemDefault,
                    "isSelected" to (effectiveSim != null && effectiveSim.subscriptionId == desc.subscriptionId)
                )
            }

            val response = mapOf(
                "sims" to sims,
                "selectedSimSlot" to effectiveSim?.simSlotIndex,
                "selectedSubscriptionId" to effectiveSim?.subscriptionId,
                "selectedCarrierName" to effectiveSim?.carrierName,
                "selectedDisplayName" to effectiveSim?.displayName,
                "needsUserSelection" to needsSelection,
                "activeCount" to descriptors.size
            )
            Log.d(TAG, "[OctalCall] getSimInfo: count=${sims.size} selectedSlot=${effectiveSim?.simSlotIndex} needsSelection=$needsSelection")
            result.success(response)
        } catch (e: Exception) {
            Log.e(TAG, "[OctalCall] getSimInfo error: ${e.message}")
            result.error("SIM_INFO_ERROR", e.message, null)
        }
    }

    // ==========================================
    // CALL INITIATION
    // ==========================================
    private fun makeDirectCall(phone: String, requestedCallId: String?, requestedSimSlot: Int?, result: MethodChannel.Result) {
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

        val (descriptors, effectiveSim, _) = getActiveSimsWithReconciliation()
        val telecomManager = getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
        val callAccounts = telecomManager?.getCallCapablePhoneAccounts() ?: emptyList()

        var matchedHandle: PhoneAccountHandle? = null
        var targetSlot: Int? = null
        var targetSubId: Int? = null

        // Dynamic multi-SIM routing: If operator selected a specific SIM slot (0 or 1), prioritize it
        val targetSim = if (requestedSimSlot != null && requestedSimSlot >= 0) {
            descriptors.find { it.simSlotIndex == requestedSimSlot } ?: effectiveSim
        } else {
            effectiveSim
        }

        if (targetSim != null) {
            targetSlot = targetSim.simSlotIndex
            targetSubId = targetSim.subscriptionId

            matchedHandle = callAccounts.find {
                it.id == targetSubId.toString() || it.id.contains(targetSubId.toString())
            }
            if (matchedHandle == null && targetSim.isSystemDefault) {
                matchedHandle = telecomManager?.getDefaultOutgoingPhoneAccount(PhoneAccount.SCHEME_TEL)
            }
        }

        if (matchedHandle == null) {
            matchedHandle = telecomManager?.getDefaultOutgoingPhoneAccount(PhoneAccount.SCHEME_TEL)
        }

        val callId = requestedCallId ?: "call_${System.currentTimeMillis()}"

        val session = ActiveCallSession(
            callId = callId,
            phoneNumber = cleanPhone.filter { it.isDigit() },
            rawPhone = phone,
            startedAt = System.currentTimeMillis(),
            simSlot = targetSlot,
            subscriptionId = targetSubId
        )

        synchronized(callLock) {
            currentCall = session
        }

        val intent = Intent(Intent.ACTION_CALL).apply {
            data = Uri.parse("tel:$cleanPhone")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
            if (matchedHandle != null) {
                putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, matchedHandle)
                putExtra("android.telecom.extra.PHONE_ACCOUNT_HANDLE", matchedHandle)
            }
            if (targetSlot != null) {
                putExtra("com.android.phone.extra.slot", targetSlot)
                putExtra("simSlot", targetSlot)
                putExtra("slot", targetSlot)
            }
            if (targetSubId != null) {
                putExtra("com.android.phone.extra.Subscription", targetSubId)
                putExtra("subscription", targetSubId)
                putExtra("subscription_id", targetSubId)
                putExtra("phone_subscription", targetSubId)
            }
        }

        try {
            Log.d(TAG, "[OctalCall] CALL_START callId=$callId phone=$cleanPhone slot=$targetSlot subId=$targetSubId handle=${matchedHandle?.id ?: "SYSTEM_DEFAULT"}")
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
