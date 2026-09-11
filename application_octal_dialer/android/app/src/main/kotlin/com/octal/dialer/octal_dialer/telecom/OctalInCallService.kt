package com.octal.dialer.octal_dialer.telecom

import android.content.Intent
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.InCallService
import android.util.Log
import com.octal.dialer.octal_dialer.MainActivity

/**
 * Android Telecom InCallService implementation for Octal Dialer.
 * Binds directly with Android Telecom framework when Octal is the Default Dialer
 * or when handling calls placed through Octal.
 *
 * Forwards all call lifecycle and audio routing events directly to OctalCallManager.
 */
class OctalInCallService : InCallService() {
    private val TAG = "OctalInCallService"

    private val callCallbacks = mutableMapOf<Call, Call.Callback>()

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "[Telecom] OctalInCallService created and bound to system Telecom")
        OctalCallManager.bindInCallService(this)
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        Log.d(TAG, "[Telecom] InCallService onCallAdded: ${call.details?.handle}")

        val callback = object : Call.Callback() {
            override fun onStateChanged(targetCall: Call, state: Int) {
                super.onStateChanged(targetCall, state)
                OctalCallManager.onCallStateChanged(targetCall, state)
            }

            override fun onDetailsChanged(targetCall: Call, details: Call.Details) {
                super.onDetailsChanged(targetCall, details)
                // When details change (e.g. caller ID resolved or connect time updated)
                OctalCallManager.onCallStateChanged(targetCall, targetCall.state)
            }
        }

        callCallbacks[call] = callback
        call.registerCallback(callback)

        OctalCallManager.onCallAdded(call)

        // If app is not in the foreground, optionally launch MainActivity so user sees the call
        bringAppToForeground()
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        Log.d(TAG, "[Telecom] InCallService onCallRemoved")

        val callback = callCallbacks.remove(call)
        if (callback != null) {
            try {
                call.unregisterCallback(callback)
            } catch (e: Exception) {
                Log.w(TAG, "[Telecom] Error unregistering call callback: ${e.message}")
            }
        }

        OctalCallManager.onCallRemoved(call)
    }

    override fun onCallAudioStateChanged(audioState: CallAudioState) {
        super.onCallAudioStateChanged(audioState)
        OctalCallManager.onAudioStateChanged(audioState)
    }

    override fun onBringToForeground(showDialpad: Boolean) {
        super.onBringToForeground(showDialpad)
        Log.d(TAG, "[Telecom] onBringToForeground requested (showDialpad=$showDialpad)")
        bringAppToForeground()
    }

    override fun onSilenceRinger() {
        super.onSilenceRinger()
        Log.d(TAG, "[Telecom] onSilenceRinger requested")
    }

    override fun onDestroy() {
        Log.d(TAG, "[Telecom] OctalInCallService destroyed")
        callCallbacks.forEach { (call, callback) ->
            try {
                call.unregisterCallback(callback)
            } catch (_: Exception) {}
        }
        callCallbacks.clear()
        OctalCallManager.unbindInCallService(this)
        super.onDestroy()
    }

    private fun bringAppToForeground() {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "[Telecom] Unable to bring MainActivity to foreground: ${e.message}")
        }
    }
}
