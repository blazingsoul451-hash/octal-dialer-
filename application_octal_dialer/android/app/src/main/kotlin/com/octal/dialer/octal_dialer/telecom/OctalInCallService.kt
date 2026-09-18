package com.octal.dialer.octal_dialer.telecom

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.InCallService
import android.util.Log
import androidx.core.app.NotificationCompat
import com.octal.dialer.octal_dialer.MainActivity
import com.octal.dialer.octal_dialer.R

/**
 * Android Telecom InCallService implementation for Octal Dialer.
 * Binds directly with Android Telecom framework when Octal is the Default Dialer
 * or when handling calls placed through Octal.
 *
 * Forwards all call lifecycle and audio routing events directly to OctalCallManager.
 */
class OctalInCallService : InCallService() {
    companion object {
        private const val TAG = "OctalInCallService"
        const val INCOMING_CALL_CHANNEL_ID = "octal_incoming_call_channel"
        const val INCOMING_NOTIFICATION_ID = 202
    }

    private val callCallbacks = mutableMapOf<Call, Call.Callback>()

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "[Telecom] OctalInCallService created and bound to system Telecom")
        createIncomingCallChannel()
        OctalCallManager.bindInCallService(this)
    }

    private fun createIncomingCallChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .build()

            val channel = NotificationChannel(
                INCOMING_CALL_CHANNEL_ID,
                "Octal Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "High priority incoming phone call alerts"
                setSound(soundUri, audioAttributes)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 1000, 1000, 1000)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun showIncomingCallNotification(call: Call) {
        try {
            val rawHandle = call.details?.handle?.schemeSpecificPart ?: "Incoming Call"
            val callerName = call.details?.callerDisplayName ?: rawHandle

            val fullScreenIntent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                putExtra("isIncomingCall", true)
                putExtra("phoneNumber", rawHandle)
                putExtra("callerName", callerName)
            }
            val pendingFullScreen = PendingIntent.getActivity(
                this,
                0,
                fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
            )

            val notification = NotificationCompat.Builder(this, INCOMING_CALL_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(callerName)
                .setContentText("Incoming call...")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(true)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setFullScreenIntent(pendingFullScreen, true)
                .setContentIntent(pendingFullScreen)
                .build()

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(INCOMING_NOTIFICATION_ID, notification)
            Log.d(TAG, "[Telecom] Posted incoming call full-screen notification for $rawHandle")
        } catch (e: Exception) {
            Log.e(TAG, "[Telecom] Failed to post incoming call notification: ${e.message}")
        }
    }

    private fun dismissIncomingCallNotification() {
        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(INCOMING_NOTIFICATION_ID)
        } catch (_: Exception) {}
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        Log.d(TAG, "[Telecom] InCallService onCallAdded: ${call.details?.handle} state=${call.state}")

        val callback = object : Call.Callback() {
            override fun onStateChanged(targetCall: Call, state: Int) {
                super.onStateChanged(targetCall, state)
                if (state != Call.STATE_RINGING) {
                    dismissIncomingCallNotification()
                }
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

        if (call.state == Call.STATE_RINGING) {
            showIncomingCallNotification(call)
        }

        // If app is not in the foreground, optionally launch MainActivity so user sees the call
        bringAppToForeground()
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        Log.d(TAG, "[Telecom] InCallService onCallRemoved")
        dismissIncomingCallNotification()

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
