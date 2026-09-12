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
 * Manages Octal's Default Dialer role checking/requesting via official Android Telecom APIs.
 *
 * NOTE: For physical GSM/carrier calling, Octal operates as a Default Dialer and InCallService UI.
 * An InCallService is NOT a ConnectionService and must NOT register a custom PhoneAccount with
 * CAPABILITY_CALL_PROVIDER. Cellular calls route through the system SIM PhoneAccountHandles
 * returned by TelecomManager.callCapablePhoneAccounts.
 */
object OctalPhoneAccountManager {
    private const val TAG = "OctalPhoneAccount"
    private const val LEGACY_ACCOUNT_ID = "octal_dialer_phone_account"

    /**
     * Unregisters any legacy PhoneAccount that may have been erroneously registered
     * pointing to OctalInCallService.
     */
    fun unregisterLegacyPhoneAccount(context: Context) {
        try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager ?: return
            val componentName = ComponentName(context, OctalInCallService::class.java)
            val legacyHandle = PhoneAccountHandle(componentName, LEGACY_ACCOUNT_ID)
            telecomManager.unregisterPhoneAccount(legacyHandle)
            Log.d(TAG, "[Telecom] Unregistered legacy PhoneAccount handle: ${legacyHandle.id}")
        } catch (e: Exception) {
            // Ignore if already unregistered or not supported
        }
    }

    /**
     * Initializes Telecom phone account architecture for Octal as Default Dialer.
     * Ensures any legacy non-ConnectionService PhoneAccount is removed and logs available
     * system carrier accounts.
     */
    fun registerPhoneAccount(context: Context): Boolean {
        // Clean up legacy custom PhoneAccount if present
        unregisterLegacyPhoneAccount(context)

        return try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            if (telecomManager == null) {
                Log.e(TAG, "[Telecom] TelecomManager service unavailable")
                return false
            }

            val accounts = telecomManager.callCapablePhoneAccounts
            Log.d(TAG, "[Telecom] Initialized Telecom dialer architecture. System SIM accounts: ${accounts?.size ?: 0}")
            true
        } catch (e: SecurityException) {
            Log.w(TAG, "[Telecom] SecurityException querying callCapablePhoneAccounts: ${e.message}")
            true
        } catch (e: Exception) {
            Log.e(TAG, "[Telecom] Error initializing Telecom architecture: ${e.message}")
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
     * Verifies that system call-capable PhoneAccounts (physical SIMs) are present
     * and enabled for placing calls.
     */
    fun isPhoneAccountEnabled(context: Context): Boolean {
        return try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager ?: return false
            val accounts = telecomManager.callCapablePhoneAccounts
            !accounts.isNullOrEmpty() || isDefaultDialer(context)
        } catch (e: Exception) {
            Log.w(TAG, "[Telecom] Error checking if call-capable accounts enabled: ${e.message}")
            false
        }
    }

    /**
     * Resolves the list of active carrier/SIM PhoneAccountHandles provided by Android.
     */
    fun getSystemSimAccounts(context: Context): List<PhoneAccountHandle> {
        return try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            telecomManager?.callCapablePhoneAccounts ?: emptyList()
        } catch (e: Exception) {
            Log.w(TAG, "[Telecom] Error obtaining system SIM accounts: ${e.message}")
            emptyList()
        }
    }
}
