package com.octal.dialer.octal_dialer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

class OctalForegroundService : Service() {
    companion object {
        const val CHANNEL_ID = "octal_phone_link_channel"
        const val NOTIFICATION_ID = 101
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        const val ACTION_UPDATE_STATUS = "ACTION_UPDATE_STATUS"
        const val EXTRA_STATUS = "EXTRA_STATUS"

        fun startService(context: Context, status: String = "Connected to laptop console. Ready for calls.") {
            val intent = Intent(context, OctalForegroundService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_STATUS, status)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun updateStatus(context: Context, status: String) {
            val intent = Intent(context, OctalForegroundService::class.java).apply {
                action = ACTION_UPDATE_STATUS
                putExtra(EXTRA_STATUS, status)
            }
            context.startService(intent)
        }

        fun stopService(context: Context) {
            val intent = Intent(context, OctalForegroundService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                releaseWakeLock()
                stopForeground(true)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_UPDATE_STATUS -> {
                val status = intent.getStringExtra(EXTRA_STATUS) ?: "Phone Link active."
                val notification = buildNotification(status)
                val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.notify(NOTIFICATION_ID, notification)
            }
            else -> {
                val status = intent?.getStringExtra(EXTRA_STATUS) ?: "Connected to laptop console. Ready for calls."
                val notification = buildNotification(status)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        // Android 14+ requires explicit foregroundServiceType matching manifest
                        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
                    } else {
                        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
                    }
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            }
        }
        return START_STICKY
    }

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OctalDialer:PhoneLinkWakeLock").apply {
                    setReferenceCounted(false)
                    acquire(24 * 60 * 60 * 1000L) // 24 hours max
                }
            }
        } catch (e: Exception) {
            // Ignore if permission denied
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let {
                if (it.isHeld) it.release()
            }
            wakeLock = null
        } catch (e: Exception) {}
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Octal Phone Link Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps Octal Phone Link connected to the web console during GSM calls"
                setShowBadge(false)
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(statusText: String): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Octal Phone Link")
            .setContentText(statusText)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    override fun onDestroy() {
        releaseWakeLock()
        super.onDestroy()
    }
}
