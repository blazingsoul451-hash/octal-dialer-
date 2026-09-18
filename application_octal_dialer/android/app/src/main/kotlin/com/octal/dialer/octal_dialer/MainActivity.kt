package com.octal.dialer.octal_dialer

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.CallLog
import android.provider.ContactsContract
import android.telecom.CallAudioState
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.telephony.TelephonyCallback
import android.content.ContentProviderOperation
import android.telephony.TelephonyManager
import android.util.Log
import android.view.WindowManager
import androidx.annotation.RequiresApi
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.octal.dialer.octal_dialer.telecom.OctalCallManager
import com.octal.dialer.octal_dialer.telecom.OctalPhoneAccountManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.octal.dialer/call"
    private val PERMISSIONS_REQUEST_CODE = 1001
    private val DEFAULT_DIALER_REQUEST_CODE = 1002
    private val CONTACTS_PERMISSIONS_REQUEST_CODE = 1003
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
    private var pendingDefaultDialerResult: MethodChannel.Result? = null
    private var pendingContactsResult: MethodChannel.Result? = null
    private var telecomListener: OctalCallManager.CallEventListener? = null
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
                    // Mandatory permissions required to place and manage calls
                    val callGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
                    val stateGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
                    // READ_CALL_LOG and READ_CONTACTS are optional features and must not gate calling
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
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
                        permissionsNeeded.add(Manifest.permission.READ_CALL_LOG)
                    }
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
                        permissionsNeeded.add(Manifest.permission.READ_CONTACTS)
                    }
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
                        permissionsNeeded.add(Manifest.permission.WRITE_CONTACTS)
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
                "checkContactsPermission" -> {
                    val readGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
                    val writeGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_CONTACTS) == PackageManager.PERMISSION_GRANTED
                    result.success(readGranted && writeGranted)
                }
                "requestContactsPermission" -> {
                    val perms = mutableListOf<String>()
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
                        perms.add(Manifest.permission.READ_CONTACTS)
                    }
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
                        perms.add(Manifest.permission.WRITE_CONTACTS)
                    }
                    if (perms.isNotEmpty()) {
                        pendingContactsResult = result
                        ActivityCompat.requestPermissions(this, perms.toTypedArray(), CONTACTS_PERMISSIONS_REQUEST_CODE)
                    } else {
                        result.success(true)
                    }
                }
                "saveDeviceContact" -> {
                    val name = call.argument<String>("name") ?: ""
                    val number = call.argument<String>("number") ?: ""
                    val email = call.argument<String>("email")
                    saveDeviceContact(name, number, email, result)
                }
                "isDefaultDialer" -> {
                    result.success(OctalPhoneAccountManager.isDefaultDialer(this))
                }
                "requestDefaultDialer" -> {
                    val intent = OctalPhoneAccountManager.createDefaultDialerIntent(this)
                    if (intent != null) {
                        pendingDefaultDialerResult = result
                        startActivityForResult(intent, DEFAULT_DIALER_REQUEST_CODE)
                    } else {
                        result.success(false)
                    }
                }
                "getTelecomStatus" -> {
                    val isDefault = OctalPhoneAccountManager.isDefaultDialer(this)
                    val isEnabled = OctalPhoneAccountManager.isPhoneAccountEnabled(this)
                    val activeCount = OctalCallManager.getActiveCallCount()
                    val hasCall = OctalCallManager.hasActiveCall()
                    result.success(mapOf(
                        "isDefaultDialer" to isDefault,
                        "isPhoneAccountEnabled" to isEnabled,
                        "activeCallCount" to activeCount,
                        "hasActiveCall" to hasCall
                    ))
                }
                "telecomAnswer" -> {
                    result.success(OctalCallManager.answer())
                }
                "telecomDisconnect" -> {
                    val callId = call.argument<String>("callId")
                    result.success(OctalCallManager.disconnect(callId))
                }
                "telecomSetMuted" -> {
                    val muted = call.argument<Boolean>("muted") ?: false
                    result.success(OctalCallManager.setMuted(muted))
                }
                "telecomSetSpeaker" -> {
                    val speaker = call.argument<Boolean>("speaker") ?: false
                    val route = if (speaker) CallAudioState.ROUTE_SPEAKER else CallAudioState.ROUTE_WIRED_OR_EARPIECE
                    result.success(OctalCallManager.setAudioRoute(route))
                }
                "telecomHoldCall" -> {
                    val callId = call.argument<String>("callId")
                    result.success(OctalCallManager.holdCall(callId))
                }
                "telecomUnholdCall" -> {
                    val callId = call.argument<String>("callId")
                    result.success(OctalCallManager.unholdCall(callId))
                }
                "telecomSendDtmf" -> {
                    val digit = call.argument<String>("digit")?.firstOrNull()
                    if (digit != null) {
                        val played = OctalCallManager.playDtmfTone(digit)
                        if (played) {
                            Thread {
                                try {
                                    Thread.sleep(150)
                                    OctalCallManager.stopDtmfTone()
                                } catch (_: Exception) {}
                            }.start()
                        }
                        result.success(played)
                    } else {
                        result.success(false)
                    }
                }
                "getInCallDetails" -> {
                    result.success(OctalCallManager.getActiveCallInfo())
                }
                "telecomPlaceCall" -> {
                    val phone = call.argument<String>("phone")
                    val simSlot = call.argument<Int>("simSlot")
                    val callId = call.argument<String>("callId")
                    if (!phone.isNullOrEmpty()) {
                        telecomPlaceCall(phone, simSlot, callId, result)
                    } else {
                        result.error("INVALID_PHONE", "Phone number is empty", null)
                    }
                }
                "cancelPendingPlacement" -> {
                    val commandId = call.argument<String>("commandId")
                    OctalCallManager.cancelPendingPlacement(commandId)
                    result.success(true)
                }
                "getDeviceContacts" -> {
                    getDeviceContacts(result)
                }
                "getDeviceCallLogs" -> {
                    getDeviceCallLogs(result)
                }
                else -> {
                    result.notImplemented()
                }
            }
        }

        // Register Telecom event bridge to forward hardware call lifecycle to Flutter
        telecomListener = object : OctalCallManager.CallEventListener {
            override fun onCallAdded(callId: String, phoneNumber: String, isIncoming: Boolean) {
                runOnUiThread {
                    methodChannel?.invokeMethod("onTelecomCallAdded", mapOf(
                        "callId" to callId,
                        "phoneNumber" to phoneNumber,
                        "isIncoming" to isIncoming
                    ))
                }
            }

            override fun onCallRemoved(callId: String, phoneNumber: String, reason: String, duration: Int) {
                runOnUiThread {
                    methodChannel?.invokeMethod("onTelecomCallRemoved", mapOf(
                        "callId" to callId,
                        "phoneNumber" to phoneNumber,
                        "reason" to reason,
                        "duration" to duration
                    ))
                }
            }

            override fun onCallStateChanged(callId: String, phoneNumber: String, state: Int, stateString: String) {
                runOnUiThread {
                    methodChannel?.invokeMethod("onTelecomCallStateChanged", mapOf(
                        "callId" to callId,
                        "phoneNumber" to phoneNumber,
                        "state" to stateString,
                        "rawState" to state
                    ))
                }
            }

            override fun onAudioStateChanged(isMuted: Boolean, route: Int, routeString: String) {
                runOnUiThread {
                    methodChannel?.invokeMethod("onTelecomAudioStateChanged", mapOf(
                        "isMuted" to isMuted,
                        "route" to routeString,
                        "rawRoute" to route
                    ))
                }
            }
        }
        telecomListener?.let { OctalCallManager.addListener(it) }

        // Attempt initial PhoneAccount registration
        OctalPhoneAccountManager.registerPhoneAccount(this)

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

            val isSysDefaultInitial = (defaultVoiceSubId != SubscriptionManager.INVALID_SUBSCRIPTION_ID && defaultVoiceSubId == subId) ||
                    (defaultHandle != null && defaultHandle.id == subId.toString())

            val teleManager = telephonyManager ?: (getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager)
            val matchedHandle = OctalPhoneAccountManager.resolvePhoneAccountHandle(
                telecomManager = telecomManager,
                telephonyManager = teleManager,
                callAccounts = callAccounts,
                subId = subId,
                slotIndex = slot,
                isSystemDefault = isSysDefaultInitial,
                activeList = activeList
            )

            val isSysDefault = isSysDefaultInitial || (defaultHandle != null && matchedHandle != null && defaultHandle == matchedHandle)

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

        if (!callGranted || !stateGranted) {
            result.error("CALL_PERMISSION_REQUIRED", "CALL_PHONE and READ_PHONE_STATE permissions are required for dialing", null)
            return
        }

        val (descriptors, effectiveSim, _) = getActiveSimsWithReconciliation()
        val telecomManager = getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
        val callAccounts = telecomManager?.getCallCapablePhoneAccounts() ?: emptyList()
        val subManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
        val activeList: List<SubscriptionInfo> = if (stateGranted && subManager != null) {
            subManager.activeSubscriptionInfoList ?: emptyList()
        } else emptyList()

        var matchedHandle: PhoneAccountHandle? = null
        var targetSlot: Int? = null
        var targetSubId: Int? = null

        // Dynamic multi-SIM routing: If operator selected a specific SIM slot (0 or 1), prioritize it
        val targetSim = if (requestedSimSlot != null && requestedSimSlot >= 0) {
            descriptors.find { it.simSlotIndex == requestedSimSlot }
        } else {
            effectiveSim
        }

        if (requestedSimSlot != null && requestedSimSlot >= 0 && targetSim == null) {
            Log.e(TAG, "[OctalCall] FAIL CLOSED: Requested SIM slot $requestedSimSlot not found among active SIM descriptors")
            result.error("SIM_UNAVAILABLE", "Requested SIM slot $requestedSimSlot is not available on this device", null)
            return
        }

        if (targetSim != null) {
            targetSlot = targetSim.simSlotIndex
            targetSubId = targetSim.subscriptionId

            val teleManager = telephonyManager ?: (getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager)
            matchedHandle = OctalPhoneAccountManager.resolvePhoneAccountHandle(
                telecomManager = telecomManager,
                telephonyManager = teleManager,
                callAccounts = callAccounts,
                subId = targetSubId,
                slotIndex = targetSlot,
                isSystemDefault = targetSim.isSystemDefault,
                activeList = activeList
            )
            if (requestedSimSlot != null && requestedSimSlot >= 0 && matchedHandle == null) {
                Log.e(TAG, "[OctalCall] FAIL CLOSED: Could not resolve PhoneAccountHandle for requested SIM slot $requestedSimSlot")
                result.error("SIM_UNAVAILABLE", "Could not resolve telephony handle for requested SIM slot $requestedSimSlot", null)
                return
            }
        } else {
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
            if (!callId.isNullOrEmpty()) {
                putExtra("com.octal.dialer.extra.CALL_ID", callId)
                putExtra("callId", callId)
                OctalCallManager.registerPendingPlacement(
                    commandId = callId,
                    destination = cleanPhone,
                    accountHandleId = matchedHandle?.id,
                    ttlMs = 15000L
                )
            }
        }

        try {
            Log.d(TAG, "[OctalCall] CALL_START callId=$callId phone=$cleanPhone slot=$targetSlot subId=$targetSubId handle=${matchedHandle?.id ?: "SYSTEM_DEFAULT"}")
            startActivity(intent)
            result.success(true)
        } catch (e: SecurityException) {
            OctalCallManager.cancelPendingPlacement(callId)
            synchronized(callLock) { currentCall = null }
            Log.e(TAG, "[OctalCall] SecurityException on ACTION_CALL: ${e.message}")
            result.error("SECURITY_EXCEPTION", "Permission denied by system: ${e.message}", null)
        } catch (e: Exception) {
            OctalCallManager.cancelPendingPlacement(callId)
            synchronized(callLock) { currentCall = null }
            Log.e(TAG, "[OctalCall] ACTION_CALL failed: ${e.message}")
            result.error("CALL_FAILED", "Direct call failed: ${e.message}", null)
        }
    }

    // ==========================================
    // TELECOM DIRECT CALL INITIATION (PHASE 2)
    // ==========================================
    private fun telecomPlaceCall(phone: String, requestedSlot: Int?, requestedCallId: String?, result: MethodChannel.Result) {
        try {
            val telecomManager = getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            if (telecomManager == null) {
                result.error("TELECOM_UNAVAILABLE", "TelecomManager service unavailable", null)
                return
            }

            val hasCallPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
            if (!hasCallPermission) {
                result.error("PERMISSION_DENIED", "CALL_PHONE permission required", null)
                return
            }

            val cleanPhone = phone.filter { it.isDigit() || it == '+' }
            if (cleanPhone.isEmpty()) {
                result.error("INVALID_PHONE", "Empty phone number", null)
                return
            }
            val uri = Uri.parse("tel:$cleanPhone")

            val (descriptors, effectiveSim, _) = getActiveSimsWithReconciliation()
            val targetSim = if (requestedSlot != null && requestedSlot >= 0) {
                descriptors.find { it.simSlotIndex == requestedSlot }
            } else effectiveSim

            if (requestedSlot != null && requestedSlot >= 0 && targetSim == null) {
                Log.e(TAG, "[Telecom] FAIL CLOSED: Requested SIM slot $requestedSlot not found in active descriptors")
                result.error("SIM_UNAVAILABLE", "Requested SIM slot $requestedSlot is not available", null)
                return
            }

            val callAccounts = telecomManager.getCallCapablePhoneAccounts() ?: emptyList()
            val subManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
            val hasReadPhoneState = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
            val activeList: List<SubscriptionInfo> = if (hasReadPhoneState && subManager != null) {
                subManager.activeSubscriptionInfoList ?: emptyList()
            } else emptyList()

            val teleManager = telephonyManager ?: (getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager)
            val matchedHandle = OctalPhoneAccountManager.resolvePhoneAccountHandle(
                telecomManager = telecomManager,
                telephonyManager = teleManager,
                callAccounts = callAccounts,
                subId = targetSim?.subscriptionId,
                slotIndex = targetSim?.simSlotIndex,
                isSystemDefault = targetSim?.isSystemDefault ?: false,
                activeList = activeList
            )

            if (requestedSlot != null && requestedSlot >= 0 && matchedHandle == null) {
                Log.e(TAG, "[Telecom] FAIL CLOSED: Requested SIM slot $requestedSlot could not be resolved to a PhoneAccountHandle")
                result.error("SIM_UNAVAILABLE", "Requested SIM slot $requestedSlot could not be resolved to a call-capable account", null)
                return
            }

            val extras = Bundle().apply {
                if (matchedHandle != null) {
                    putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, matchedHandle)
                    putParcelable("android.telecom.extra.PHONE_ACCOUNT_HANDLE", matchedHandle)
                }
                if (targetSim != null) {
                    putInt("com.android.phone.extra.slot", targetSim.simSlotIndex)
                    putInt("simSlot", targetSim.simSlotIndex)
                    putInt("slot", targetSim.simSlotIndex)
                    putInt("com.android.phone.extra.Subscription", targetSim.subscriptionId)
                    putInt("subscription", targetSim.subscriptionId)
                    putInt("subscription_id", targetSim.subscriptionId)
                }
            }

            if (!requestedCallId.isNullOrEmpty()) {
                extras.putString("com.octal.dialer.extra.CALL_ID", requestedCallId)
                extras.putString("callId", requestedCallId)
                OctalCallManager.registerPendingPlacement(
                    commandId = requestedCallId,
                    destination = cleanPhone,
                    accountHandleId = matchedHandle?.id,
                    ttlMs = 15000L
                )
                synchronized(callLock) {
                    currentCall = ActiveCallSession(
                        callId = requestedCallId,
                        phoneNumber = cleanPhone,
                        rawPhone = phone,
                        startedAt = System.currentTimeMillis(),
                        simSlot = targetSim?.simSlotIndex,
                        subscriptionId = targetSim?.subscriptionId
                    )
                }
            }

            Log.d(TAG, "[Telecom] Placing direct Telecom call: phone=$cleanPhone slot=${targetSim?.simSlotIndex} subId=${targetSim?.subscriptionId} handle=${matchedHandle?.id ?: "DEFAULT"} callId=${requestedCallId ?: "NONE"}")
            telecomManager.placeCall(uri, extras)
            result.success(true)
        } catch (e: SecurityException) {
            OctalCallManager.cancelPendingPlacement(requestedCallId)
            synchronized(callLock) { currentCall = null }
            Log.e(TAG, "[Telecom] SecurityException on telecomPlaceCall: ${e.message}")
            result.error("SECURITY_EXCEPTION", "Permission denied: ${e.message}", null)
        } catch (e: Exception) {
            OctalCallManager.cancelPendingPlacement(requestedCallId)
            synchronized(callLock) { currentCall = null }
            Log.e(TAG, "[Telecom] telecomPlaceCall failed: ${e.message}")
            result.error("PLACE_CALL_FAILED", e.message, null)
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

        when (state) {
            TelephonyManager.CALL_STATE_RINGING -> {
                val callerPhone = phoneNumber ?: ""
                Log.d(TAG, "[OctalCall] TELEPHONY_STATE state=RINGING (incoming call: $callerPhone)")
                runOnUiThread {
                    methodChannel?.invokeMethod("onCallStateChanged", mapOf(
                        "state" to "RINGING",
                        "phoneNumber" to callerPhone
                    ))
                }
            }
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                session?.let {
                    it.offhookReceived = true
                    it.offhookAt = System.currentTimeMillis()
                }
                Log.d(TAG, "[OctalCall] TELEPHONY_STATE state=OFFHOOK (active/dialing)")
                runOnUiThread {
                    methodChannel?.invokeMethod("onCallStateChanged", mapOf(
                        "state" to "OFFHOOK",
                        "phoneNumber" to (phoneNumber ?: "")
                    ))
                }
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                Log.d(TAG, "[OctalCall] TELEPHONY_STATE state=IDLE (call ended)")
                runOnUiThread {
                    methodChannel?.invokeMethod("onCallStateChanged", mapOf(
                        "state" to "IDLE"
                    ))
                }
                if (session != null && !session.completionSent) {
                    startCallLogCorrelation(session)
                }
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
        if (requestCode == CONTACTS_PERMISSIONS_REQUEST_CODE) {
            val readGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
            val writeGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_CONTACTS) == PackageManager.PERMISSION_GRANTED
            pendingContactsResult?.success(readGranted && writeGranted)
            pendingContactsResult = null
            return
        }
        if (requestCode == PERMISSIONS_REQUEST_CODE) {
            // Calling gate requires mandatory telephony permissions (CALL_PHONE & READ_PHONE_STATE).
            // Denial of optional permissions (READ_CONTACTS, READ_CALL_LOG) must not block calling.
            var callPhoneGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
            var phoneStateGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
            for (i in permissions.indices) {
                if (permissions[i] == Manifest.permission.CALL_PHONE && grantResults[i] == PackageManager.PERMISSION_GRANTED) {
                    callPhoneGranted = true
                }
                if (permissions[i] == Manifest.permission.READ_PHONE_STATE && grantResults[i] == PackageManager.PERMISSION_GRANTED) {
                    phoneStateGranted = true
                }
            }
            val mandatoryGranted = callPhoneGranted && phoneStateGranted
            if (mandatoryGranted) {
                registerTelephonyListeners()
            }
            pendingResult?.success(mandatoryGranted)
            pendingResult = null
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == DEFAULT_DIALER_REQUEST_CODE) {
            val isDefault = OctalPhoneAccountManager.isDefaultDialer(this)
            Log.d(TAG, "[Telecom] Default dialer request completed. isDefault=$isDefault")
            pendingDefaultDialerResult?.success(isDefault)
            pendingDefaultDialerResult = null
        }
    }

    private fun getDeviceContacts(result: MethodChannel.Result) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            result.success(emptyList<Map<String, Any?>>())
            return
        }
        Thread {
            val contacts = mutableListOf<Map<String, Any?>>()
            val seenNumbers = mutableSetOf<String>()
            try {
                // 1. Query System Device Contacts (no arbitrary limit so all contacts sync)
                val cursor = contentResolver.query(
                    ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                    arrayOf(
                        ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                        ContactsContract.CommonDataKinds.Phone.NUMBER,
                        ContactsContract.CommonDataKinds.Phone.STARRED
                    ),
                    null, null,
                    "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
                )
                cursor?.use {
                    val idCol = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
                    val nameCol = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                    val numCol = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                    val starCol = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.STARRED)
                    while (it.moveToNext()) {
                        val name = if (nameCol >= 0) it.getString(nameCol) else null
                        val number = if (numCol >= 0) it.getString(numCol) else ""
                        val cleanNum = number.replace(Regex("[^0-9+]"), "")
                        if (cleanNum.isNotEmpty() && !seenNumbers.contains(cleanNum)) {
                            seenNumbers.add(cleanNum)
                            val isStarred = if (starCol >= 0) it.getInt(starCol) == 1 else false
                            val id = if (idCol >= 0) it.getString(idCol) else ""
                            contacts.add(mapOf(
                                "id" to id,
                                "name" to (if (!name.isNullOrBlank()) name else number),
                                "number" to number,
                                "isFavorite" to isStarred
                            ))
                        }
                    }
                }

                // 2. Query SIM Contacts from content://icc/adn for active subscriptions
                val simUris = mutableListOf<Uri>()
                simUris.add(Uri.parse("content://icc/adn"))
                try {
                    val subManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
                        subManager?.activeSubscriptionInfoList?.forEach { subInfo ->
                            simUris.add(Uri.parse("content://icc/adn/subId/${subInfo.subscriptionId}"))
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "SubscriptionManager SIM URI resolution warning: ${e.message}")
                }

                for (simUri in simUris) {
                    try {
                        val simCursor = contentResolver.query(simUri, null, null, null, null)
                        simCursor?.use { sc ->
                            val nameIndex = when {
                                sc.getColumnIndex("name") >= 0 -> sc.getColumnIndex("name")
                                sc.getColumnIndex("tag") >= 0 -> sc.getColumnIndex("tag")
                                sc.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME) >= 0 -> sc.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                                else -> -1
                            }
                            val numIndex = when {
                                sc.getColumnIndex("number") >= 0 -> sc.getColumnIndex("number")
                                sc.getColumnIndex("data1") >= 0 -> sc.getColumnIndex("data1")
                                sc.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER) >= 0 -> sc.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                                else -> -1
                            }
                            val idIndex = sc.getColumnIndex("_id")

                            while (sc.moveToNext()) {
                                val simName = if (nameIndex >= 0) sc.getString(nameIndex) else null
                                val simNum = if (numIndex >= 0) sc.getString(numIndex) else ""
                                val cleanNum = simNum.replace(Regex("[^0-9+]"), "")
                                if (cleanNum.isNotEmpty() && !seenNumbers.contains(cleanNum)) {
                                    seenNumbers.add(cleanNum)
                                    val simId = if (idIndex >= 0) sc.getString(idIndex) else "sim_${contacts.size}"
                                    contacts.add(mapOf(
                                        "id" to simId,
                                        "name" to (if (!simName.isNullOrBlank()) simName else simNum),
                                        "number" to simNum,
                                        "isFavorite" to false
                                    ))
                                }
                            }
                        }
                    } catch (e: Exception) {
                        Log.d(TAG, "SIM contact query skipped for $simUri: ${e.message}")
                    }
                }

                runOnUiThread { result.success(contacts) }
            } catch (e: Exception) {
                Log.e(TAG, "getDeviceContacts error: ${e.message}")
                runOnUiThread { result.success(contacts) }
            }
        }.start()
    }

    private fun getDeviceCallLogs(result: MethodChannel.Result) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            result.success(emptyList<Map<String, Any?>>())
            return
        }
        Thread {
            val logs = mutableListOf<Map<String, Any?>>()
            try {
                val cursor = contentResolver.query(
                    CallLog.Calls.CONTENT_URI,
                    arrayOf(
                        CallLog.Calls._ID,
                        CallLog.Calls.CACHED_NAME,
                        CallLog.Calls.NUMBER,
                        CallLog.Calls.TYPE,
                        CallLog.Calls.DATE,
                        CallLog.Calls.DURATION,
                        CallLog.Calls.PHONE_ACCOUNT_ID
                    ),
                    null, null,
                    "${CallLog.Calls.DATE} DESC"
                )
                cursor?.use {
                    val idCol = it.getColumnIndex(CallLog.Calls._ID)
                    val nameCol = it.getColumnIndex(CallLog.Calls.CACHED_NAME)
                    val numCol = it.getColumnIndex(CallLog.Calls.NUMBER)
                    val typeCol = it.getColumnIndex(CallLog.Calls.TYPE)
                    val dateCol = it.getColumnIndex(CallLog.Calls.DATE)
                    val durCol = it.getColumnIndex(CallLog.Calls.DURATION)
                    val simCol = it.getColumnIndex(CallLog.Calls.PHONE_ACCOUNT_ID)

                    while (it.moveToNext() && logs.size < 200) {
                        val id = if (idCol >= 0) it.getString(idCol) else ""
                        val rawName = if (nameCol >= 0) it.getString(nameCol) else null
                        val number = if (numCol >= 0) it.getString(numCol) else ""
                        val name = if (!rawName.isNullOrBlank()) rawName else (if (number.isNotBlank()) number else "Unknown")
                        val type = if (typeCol >= 0) it.getInt(typeCol) else CallLog.Calls.INCOMING_TYPE
                        val date = if (dateCol >= 0) it.getLong(dateCol) else 0L
                        val duration = if (durCol >= 0) it.getInt(durCol) else 0
                        val simId = if (simCol >= 0) it.getString(simCol) else ""

                        val typeString = when (type) {
                            CallLog.Calls.INCOMING_TYPE -> "INCOMING"
                            CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
                            CallLog.Calls.MISSED_TYPE -> "MISSED"
                            CallLog.Calls.REJECTED_TYPE -> "REJECTED"
                            CallLog.Calls.BLOCKED_TYPE -> "BLOCKED"
                            else -> "UNKNOWN"
                        }

                        logs.add(mapOf(
                            "id" to id,
                            "name" to name,
                            "number" to number,
                            "type" to typeString,
                            "timestamp" to date,
                            "duration" to duration,
                            "simId" to simId
                        ))
                    }
                }
                runOnUiThread { result.success(logs) }
            } catch (e: Exception) {
                Log.e(TAG, "getDeviceCallLogs error: ${e.message}")
                runOnUiThread { result.success(emptyList<Map<String, Any?>>()) }
            }
        }.start()
    }

    private fun saveDeviceContact(
        displayName: String,
        phoneNumber: String,
        email: String?,
        result: MethodChannel.Result
    ) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            result.error("PERMISSION_DENIED", "WRITE_CONTACTS permission not granted", null)
            return
        }
        Thread {
            try {
                val ops = ArrayList<ContentProviderOperation>()
                val rawContactInsertIndex = ops.size

                ops.add(ContentProviderOperation.newInsert(ContactsContract.RawContacts.CONTENT_URI)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, null)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, null)
                    .build())

                if (displayName.isNotEmpty()) {
                    ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                        .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawContactInsertIndex)
                        .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE)
                        .withValue(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, displayName)
                        .build())
                }

                if (phoneNumber.isNotEmpty()) {
                    ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                        .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawContactInsertIndex)
                        .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                        .withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, phoneNumber)
                        .withValue(ContactsContract.CommonDataKinds.Phone.TYPE, ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE)
                        .build())
                }

                if (!email.isNullOrEmpty()) {
                    ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                        .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, rawContactInsertIndex)
                        .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE)
                        .withValue(ContactsContract.CommonDataKinds.Email.DATA, email)
                        .withValue(ContactsContract.CommonDataKinds.Email.TYPE, ContactsContract.CommonDataKinds.Email.TYPE_HOME)
                        .build())
                }

                contentResolver.applyBatch(ContactsContract.AUTHORITY, ops)
                runOnUiThread { result.success(true) }
            } catch (e: Exception) {
                Log.e(TAG, "saveDeviceContact error: ${e.message}")
                runOnUiThread { result.error("SAVE_FAILED", e.message, null) }
            }
        }.start()
    }

    override fun onDestroy() {
        try {
            telecomListener?.let { OctalCallManager.removeListener(it) }
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
