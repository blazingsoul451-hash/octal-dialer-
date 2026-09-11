package com.octal.dialer.octal_dialer.telecom

import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log

/**
 * Manages Octal's PhoneAccount registration, PhoneAccountHandle resolution,
 * and Android Default Dialer role checking/requesting via official Telecom APIs.
 */
object OctalPhoneAccountManager {
    private const val TAG = "OctalPhoneAccount"
    private const val ACCOUNT_ID = "octal_dialer_phone_account"
    private const val ACCOUNT_LABEL = "Octal Dialer"

    /**
     * Obtains the unique PhoneAccountHandle representing the Octal calling service.
     */
    fun getPhoneAccountHandle(context: Context): PhoneAccountHandle {
        val componentName = ComponentName(context, OctalInCallService::class.java)
        return PhoneAccountHandle(componentName, ACCOUNT_ID)
    }

    /**
     * Registers Octal's PhoneAccount with Android TelecomManager.
     * Uses official Android Telecom APIs without hardcoding SIM or device IDs.
     */
    fun registerPhoneAccount(context: Context): Boolean {
        return try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            if (telecomManager == null) {
                Log.e(TAG, "[Telecom] TelecomManager service unavailable")
                return false
            }

            val handle = getPhoneAccountHandle(context)
            val builder = PhoneAccount.builder(handle, ACCOUNT_LABEL)
                .setCapabilities(PhoneAccount.CAPABILITY_CALL_PROVIDER)
                .setIcon(android.graphics.drawable.Icon.createWithResource(context, com.octal.dialer.octal_dialer.R.mipmap.ic_launcher))
                .setShortDescription("Octal Calling Service")
                .addSupportedUriScheme(PhoneAccount.SCHEME_TEL)

            val account = builder.build()
            telecomManager.registerPhoneAccount(account)
            Log.d(TAG, "[Telecom] PhoneAccount registered successfully with handle: ${handle.id}")
            true
        } catch (e: SecurityException) {
            Log.w(TAG, "[Telecom] SecurityException registering PhoneAccount: ${e.message}")
            false
        } catch (e: Exception) {
            Log.e(TAG, "[Telecom] Failed to register PhoneAccount: ${e.message}")
            false
        }
    }

    /**
     * Checks if Octal is currently the system's Default Dialer / Default Phone App.
     * Uses RoleManager on Android 10+ (API 29+) and TelecomManager fallback on older versions.
     */
    fun isDefaultDialer(context: Context): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager
                if (roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_DIALER)) {
                    return roleManager.isRoleHeld(RoleManager.ROLE_DIALER)
                }
            }
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            telecomManager?.defaultDialerPackage == context.packageName
        } catch (e: Exception) {
            Log.e(TAG, "[Telecom] Error checking default dialer status: ${e.message}")
            false
        }
    }

    /**
     * Creates an official system Intent for requesting the Default Dialer role.
     * The user must explicitly confirm the role via the Android OS dialog.
     */
    fun createDefaultDialerIntent(context: Context): Intent? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager
                if (roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_DIALER)) {
                    return roleManager.createRequestRoleIntent(RoleManager.ROLE_DIALER)
                }
            }
            @Suppress("DEPRECATION")
            Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER).apply {
                putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, context.packageName)
            }
        } catch (e: Exception) {
            Log.e(TAG, "[Telecom] Error creating default dialer intent: ${e.message}")
            null
        }
    }

    /**
     * Checks if Octal's registered PhoneAccount is currently enabled by the user in system settings.
     */
    fun isPhoneAccountEnabled(context: Context): Boolean {
        return try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager ?: return false
            val handle = getPhoneAccountHandle(context)
            val account = telecomManager.getPhoneAccount(handle)
            account?.isEnabled == true
        } catch (e: Exception) {
            Log.w(TAG, "[Telecom] Error checking if PhoneAccount is enabled: ${e.message}")
            false
        }
    }
}
