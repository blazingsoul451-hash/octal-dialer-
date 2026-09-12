package com.octal.dialer.octal_dialer.telecom

import android.os.Build
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.VideoProfile
import android.util.Log
import java.lang.ref.WeakReference
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Thread-safe native Call Manager for Octal Dialer.
 * Coordinates between OctalInCallService, Android Telecom framework,
 * and the presentation/Flutter layer via CallEventListener.
 *
 * Exposes genuine Telecom hardware controls (answer, disconnect, mute,
 * speakerphone audio routing, DTMF tones).
 */
object OctalCallManager {
    private const val TAG = "OctalCallManager"

    // Weak reference to the currently bound InCallService
    private var inCallServiceRef: WeakReference<OctalInCallService>? = null

    // In-memory active calls map (keyed by unique Call hash/id)
    private val activeCalls = ConcurrentHashMap<String, Call>()

    // Track active talk start times for accurate duration measurement
    private val activeStartTimes = ConcurrentHashMap<String, Long>()

    // Event listeners
    private val listeners = CopyOnWriteArrayList<CallEventListener>()

    // Current call audio state
    private var currentAudioState: CallAudioState? = null

    interface CallEventListener {
        fun onCallAdded(callId: String, phoneNumber: String, isIncoming: Boolean)
        fun onCallRemoved(callId: String, phoneNumber: String, reason: String, duration: Int)
        fun onCallStateChanged(callId: String, phoneNumber: String, state: Int, stateString: String)
        fun onAudioStateChanged(isMuted: Boolean, route: Int, routeString: String)
    }

    fun addListener(listener: CallEventListener) {
        if (!listeners.contains(listener)) {
            listeners.add(listener)
        }
    }

    fun removeListener(listener: CallEventListener) {
        listeners.remove(listener)
    }

    // ==========================================
    // INCALLSERVICE LIFECYCLE BINDING
    // ==========================================
    fun bindInCallService(service: OctalInCallService) {
        Log.d(TAG, "[Telecom] InCallService bound to OctalCallManager")
        inCallServiceRef = WeakReference(service)
    }

    fun unbindInCallService(service: OctalInCallService) {
        Log.d(TAG, "[Telecom] InCallService unbound from OctalCallManager")
        if (inCallServiceRef?.get() == service) {
            inCallServiceRef = null
        }
        activeCalls.clear()
    }

    // ==========================================
    // CALL TRACKING & EVENTS
    // ==========================================
    fun getCallId(call: Call): String {
        return "call_${System.identityHashCode(call)}"
    }

    fun getPhoneNumber(call: Call): String {
        return try {
            val handle = call.details?.handle
            val schemeSpecific = handle?.schemeSpecificPart ?: ""
            if (schemeSpecific.isNotEmpty()) schemeSpecific else ""
        } catch (e: Exception) {
            ""
        }
    }

    fun getDisplayName(call: Call): String {
        return try {
            val name = call.details?.callerDisplayName
            if (!name.isNullOrEmpty()) name else getPhoneNumber(call)
        } catch (e: Exception) {
            ""
        }
    }

    fun getStateString(state: Int): String {
        return when (state) {
            Call.STATE_NEW -> "NEW"
            Call.STATE_DIALING -> "DIALING"
            Call.STATE_RINGING -> "RINGING"
            Call.STATE_HOLDING -> "HOLDING"
            Call.STATE_ACTIVE -> "ACTIVE"
            Call.STATE_DISCONNECTED -> "DISCONNECTED"
            Call.STATE_DISCONNECTING -> "DISCONNECTING"
            Call.STATE_SELECT_PHONE_ACCOUNT -> "SELECT_PHONE_ACCOUNT"
            Call.STATE_CONNECTING -> "CONNECTING"
            else -> "UNKNOWN"
        }
    }

    fun getAudioRouteString(route: Int): String {
        return when (route) {
            CallAudioState.ROUTE_EARPIECE -> "EARPIECE"
            CallAudioState.ROUTE_SPEAKER -> "SPEAKER"
            CallAudioState.ROUTE_BLUETOOTH -> "BLUETOOTH"
            CallAudioState.ROUTE_WIRED_HEADSET -> "WIRED_HEADSET"
            CallAudioState.ROUTE_WIRED_OR_EARPIECE -> "WIRED_OR_EARPIECE"
            else -> "UNKNOWN"
        }
    }

    fun onCallAdded(call: Call) {
        val callId = getCallId(call)
        activeCalls[callId] = call
        val number = getPhoneNumber(call)
        val isIncoming = call.state == Call.STATE_RINGING

        Log.d(TAG, "[Telecom] onCallAdded id=$callId number=$number isIncoming=$isIncoming state=${getStateString(call.state)}")

        listeners.forEach { listener ->
            try {
                listener.onCallAdded(callId, number, isIncoming)
            } catch (e: Exception) {
                Log.e(TAG, "[Telecom] Listener error onCallAdded: ${e.message}")
            }
        }
    }

    fun onCallStateChanged(call: Call, state: Int) {
        val callId = getCallId(call)
        val number = getPhoneNumber(call)
        val stateStr = getStateString(state)

        if (state == Call.STATE_ACTIVE && !activeStartTimes.containsKey(callId)) {
            activeStartTimes[callId] = System.currentTimeMillis()
            Log.d(TAG, "[Telecom] Active talk started for call $callId at ${activeStartTimes[callId]}")
        }

        Log.d(TAG, "[Telecom] onCallStateChanged id=$callId state=$stateStr ($state)")

        listeners.forEach { listener ->
            try {
                listener.onCallStateChanged(callId, number, state, stateStr)
            } catch (e: Exception) {
                Log.e(TAG, "[Telecom] Listener error onCallStateChanged: ${e.message}")
            }
        }
    }

    fun onCallRemoved(call: Call) {
        val callId = getCallId(call)
        activeCalls.remove(callId)
        val number = getPhoneNumber(call)

        val activeStart = activeStartTimes.remove(callId) ?: 0L
        val activeDuration = if (activeStart > 0L) {
            ((System.currentTimeMillis() - activeStart) / 1000L).toInt().coerceAtLeast(0)
        } else 0

        val details = call.details
        val disconnectCause = details?.disconnectCause
        val rawDisconnectReason = when (disconnectCause?.code) {
            android.telecom.DisconnectCause.LOCAL -> "CANCELLED"
            android.telecom.DisconnectCause.REMOTE -> "COMPLETED"
            android.telecom.DisconnectCause.MISSED -> "MISSED"
            android.telecom.DisconnectCause.REJECTED -> "REJECTED"
            android.telecom.DisconnectCause.BUSY -> "BUSY"
            android.telecom.DisconnectCause.ERROR -> "ERROR"
            else -> "DISCONNECTED"
        }

        val connectTime = details?.connectTimeMillis ?: 0L
        val telecomDuration = if (connectTime > 0L) {
            ((System.currentTimeMillis() - connectTime) / 1000L).toInt().coerceAtLeast(0)
        } else 0

        val duration = maxOf(activeDuration, telecomDuration)

        // If the call was actively connected and sustained for >= 10s, it is authoritative ANSWERED
        val reason = if (duration >= 10) {
            "ANSWERED"
        } else if (duration > 0 && rawDisconnectReason != "CANCELLED") {
            "COMPLETED"
        } else {
            rawDisconnectReason
        }

        Log.d(TAG, "[Telecom] onCallRemoved id=$callId rawReason=$rawDisconnectReason finalReason=$reason duration=${duration}s (active=${activeDuration}s, telecom=${telecomDuration}s)")

        listeners.forEach { listener ->
            try {
                listener.onCallRemoved(callId, number, reason, duration)
            } catch (e: Exception) {
                Log.e(TAG, "[Telecom] Listener error onCallRemoved: ${e.message}")
            }
        }
    }

    fun onAudioStateChanged(audioState: CallAudioState) {
        currentAudioState = audioState
        val isMuted = audioState.isMuted
        val route = audioState.route
        val routeStr = getAudioRouteString(route)

        Log.d(TAG, "[Telecom] onAudioStateChanged isMuted=$isMuted route=$routeStr")

        listeners.forEach { listener ->
            try {
                listener.onAudioStateChanged(isMuted, route, routeStr)
            } catch (e: Exception) {
                Log.e(TAG, "[Telecom] Listener error onAudioStateChanged: ${e.message}")
            }
        }
    }

    // ==========================================
    // REAL TELECOM HARDWARE CALL CONTROLS
    // ==========================================
    fun getPrimaryCall(): Call? {
        // Return ACTIVE call if present, otherwise RINGING or DIALING, otherwise first
        return activeCalls.values.find { it.state == Call.STATE_ACTIVE }
            ?: activeCalls.values.find { it.state == Call.STATE_RINGING }
            ?: activeCalls.values.find { it.state == Call.STATE_DIALING || it.state == Call.STATE_CONNECTING }
            ?: activeCalls.values.firstOrNull()
    }

    fun answer(videoState: Int = VideoProfile.STATE_AUDIO_ONLY): Boolean {
        val ringingCall = activeCalls.values.find { it.state == Call.STATE_RINGING } ?: getPrimaryCall()
        return if (ringingCall != null) {
            try {
                ringingCall.answer(videoState)
                Log.d(TAG, "[Telecom] Call answered successfully")
                true
            } catch (e: Exception) {
                Log.e(TAG, "[Telecom] Failed to answer call: ${e.message}")
                false
            }
        } else {
            Log.w(TAG, "[Telecom] answer: No ringing call available")
            false
        }
    }

    fun disconnect(): Boolean {
        val call = getPrimaryCall()
        return if (call != null) {
            try {
                call.disconnect()
                Log.d(TAG, "[Telecom] Call disconnected successfully")
                true
            } catch (e: Exception) {
                Log.e(TAG, "[Telecom] Failed to disconnect call: ${e.message}")
                false
            }
        } else {
            Log.w(TAG, "[Telecom] disconnect: No active call to disconnect")
            false
        }
    }

    fun setMuted(muted: Boolean): Boolean {
        val service = inCallServiceRef?.get()
        return if (service != null) {
            try {
                service.setMuted(muted)
                Log.d(TAG, "[Telecom] Hardware microphone mute set to: $muted")
                true
            } catch (e: Exception) {
                Log.e(TAG, "[Telecom] Failed to set muted state: ${e.message}")
                false
            }
        } else {
            Log.w(TAG, "[Telecom] setMuted: InCallService not bound")
            false
        }
    }

    fun setAudioRoute(route: Int): Boolean {
        val service = inCallServiceRef?.get()
        return if (service != null) {
            try {
                service.setAudioRoute(route)
                Log.d(TAG, "[Telecom] Hardware audio route set to: ${getAudioRouteString(route)} ($route)")
                true
            } catch (e: Exception) {
                Log.e(TAG, "[Telecom] Failed to set audio route: ${e.message}")
                false
            }
        } else {
            Log.w(TAG, "[Telecom] setAudioRoute: InCallService not bound")
            false
        }
    }

    fun playDtmfTone(digit: Char): Boolean {
        val call = getPrimaryCall()
        return if (call != null && call.state == Call.STATE_ACTIVE) {
            try {
                call.playDtmfTone(digit)
                Log.d(TAG, "[Telecom] Played DTMF tone: $digit")
                true
            } catch (e: Exception) {
                Log.e(TAG, "[Telecom] Failed to play DTMF tone: ${e.message}")
                false
            }
        } else {
            Log.w(TAG, "[Telecom] playDtmfTone: No ACTIVE call available")
            false
        }
    }

    fun stopDtmfTone(): Boolean {
        val call = getPrimaryCall()
        return if (call != null) {
            try {
                call.stopDtmfTone()
                true
            } catch (e: Exception) {
                false
            }
        } else false
    }

    fun holdCall(callId: String? = null): Boolean {
        val call = if (callId != null) activeCalls[callId] else getPrimaryCall()
        return if (call != null) {
            try {
                call.hold()
                Log.d(TAG, "[Telecom] Call held successfully (id=$callId)")
                true
            } catch (e: Exception) {
                Log.e(TAG, "[Telecom] Failed to hold call: ${e.message}")
                false
            }
        } else {
            Log.w(TAG, "[Telecom] holdCall: No call found to hold")
            false
        }
    }

    fun unholdCall(callId: String? = null): Boolean {
        val call = if (callId != null) activeCalls[callId] else {
            activeCalls.values.find { it.state == Call.STATE_HOLDING } ?: getPrimaryCall()
        }
        return if (call != null) {
            try {
                call.unhold()
                Log.d(TAG, "[Telecom] Call unheld successfully (id=$callId)")
                true
            } catch (e: Exception) {
                Log.e(TAG, "[Telecom] Failed to unhold call: ${e.message}")
                false
            }
        } else {
            Log.w(TAG, "[Telecom] unholdCall: No call found to unhold")
            false
        }
    }

    // ==========================================
    // STATUS QUERIES
    // ==========================================
    fun getActiveCallCount(): Int = activeCalls.size

    fun hasActiveCall(): Boolean = activeCalls.isNotEmpty()

    fun getActiveCallInfo(): Map<String, Any?>? {
        val call = getPrimaryCall() ?: return null
        val callId = getCallId(call)
        val number = getPhoneNumber(call)
        val name = getDisplayName(call)
        val state = call.state
        val stateStr = getStateString(state)
        val isIncoming = state == Call.STATE_RINGING
        val connectTime = call.details?.connectTimeMillis ?: 0L
        val duration = if (connectTime > 0) {
            ((System.currentTimeMillis() - connectTime) / 1000L).toInt().coerceAtLeast(0)
        } else 0

        val audioState = currentAudioState
        val isMuted = audioState?.isMuted ?: false
        val route = audioState?.route ?: CallAudioState.ROUTE_EARPIECE
        val isSpeaker = route == CallAudioState.ROUTE_SPEAKER

        return mapOf(
            "callId" to callId,
            "phoneNumber" to number,
            "displayName" to name,
            "state" to stateStr,
            "rawState" to state,
            "isIncoming" to isIncoming,
            "isActive" to (state == Call.STATE_ACTIVE),
            "isRinging" to (state == Call.STATE_RINGING),
            "isDialing" to (state == Call.STATE_DIALING || state == Call.STATE_CONNECTING),
            "duration" to duration,
            "connectTimeMillis" to connectTime,
            "isMuted" to isMuted,
            "isSpeaker" to isSpeaker,
            "audioRoute" to getAudioRouteString(route)
        )
    }
}
