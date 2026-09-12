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
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
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

    /**
     * Deterministically resolves the system PhoneAccountHandle for a target SIM.
     * Priority order:
     * 1. Official Android Telecom/Telephony mapping: TelephonyManager.getSubscriptionId(handle)
     * 2. Exact PhoneAccountHandle.id match against subId.toString()
     * 3. Exact PhoneAccountHandle.id match against info.iccId (if accessible)
     * 4. Exact system default outgoing account if target is marked as default
     * 5. Deductive dual-SIM reconciliation: if 2 SIMs and 2 accounts, and one account matches defaultHandle,
     *    the non-default SIM maps to the remaining callAccount
     * 6. Safe fallback to TelecomManager.getDefaultOutgoingPhoneAccount(PhoneAccount.SCHEME_TEL)
     *
     * Substring matching and arbitrary list index assumptions are STRICTLY PROHIBITED.
     */
    fun resolvePhoneAccountHandle(
        telecomManager: TelecomManager?,
        telephonyManager: TelephonyManager? = null,
        callAccounts: List<PhoneAccountHandle>,
        subId: Int?,
        slotIndex: Int?,
        isSystemDefault: Boolean = false,
        activeList: List<SubscriptionInfo> = emptyList()
    ): PhoneAccountHandle? {
        if (callAccounts.isEmpty()) {
            return telecomManager?.getDefaultOutgoingPhoneAccount(PhoneAccount.SCHEME_TEL)
        }

        val defaultHandle = telecomManager?.getDefaultOutgoingPhoneAccount(PhoneAccount.SCHEME_TEL)

        // Resolve target subscription ID: either directly or via slotIndex lookup in activeList
        val targetSubId = if (subId != null && subId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
            subId
        } else if (slotIndex != null) {
            activeList.find { it.simSlotIndex == slotIndex }?.subscriptionId
        } else null

        // 1. Official Android Telecom/Telephony mapping: TelephonyManager.getSubscriptionId(handle)
        if (targetSubId != null && targetSubId != SubscriptionManager.INVALID_SUBSCRIPTION_ID && telephonyManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                for (handle in callAccounts) {
                    try {
                        val handleSubId = telephonyManager.getSubscriptionId(handle)
                        if (handleSubId != SubscriptionManager.INVALID_SUBSCRIPTION_ID && handleSubId == targetSubId) {
                            Log.d(TAG, "[Telecom] Deterministic handle resolved via TelephonyManager.getSubscriptionId: handle=${handle.id} subId=$targetSubId")
                            return handle
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "[Telecom] Error querying TelephonyManager.getSubscriptionId for handle ${handle.id}: ${e.message}")
                    }
                }
            }
        }

        // 2. Exact PhoneAccountHandle ID match against actual subscription ID string
        if (targetSubId != null && targetSubId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
            val exactSubMatch = callAccounts.find { it.id == targetSubId.toString() }
            if (exactSubMatch != null) {
                Log.d(TAG, "[Telecom] Deterministic handle resolved via exact subId string: handle=${exactSubMatch.id} subId=$targetSubId")
                return exactSubMatch
            }

            // 3. Exact match against SIM ICCID (if accessible from SubscriptionInfo)
            val subInfo = activeList.find { it.subscriptionId == targetSubId }
            @Suppress("DEPRECATION")
            val iccId = try { subInfo?.iccId } catch (_: Exception) { null }
            if (!iccId.isNullOrEmpty()) {
                val exactIccMatch = callAccounts.find { it.id.equals(iccId, ignoreCase = true) }
                if (exactIccMatch != null) {
                    Log.d(TAG, "[Telecom] Deterministic handle resolved via exact ICCID: handle=${exactIccMatch.id} iccId=$iccId")
                    return exactIccMatch
                }
            }
        }

        // 4. Exact system default account match if target is system default
        if (isSystemDefault && defaultHandle != null && callAccounts.contains(defaultHandle)) {
            Log.d(TAG, "[Telecom] Target SIM is system default; using defaultHandle: ${defaultHandle.id}")
            return defaultHandle
        }

        // Deductive dual-SIM reconciliation: if 2 accounts and 2 active subscriptions
        if (callAccounts.size == 2 && activeList.size == 2 && defaultHandle != null && callAccounts.contains(defaultHandle)) {
            if (isSystemDefault) {
                return defaultHandle
            } else {
                val nonDefaultAccount = callAccounts.find { it != defaultHandle }
                if (nonDefaultAccount != null) {
                    Log.d(TAG, "[Telecom] Deductive dual-SIM non-default account resolved: ${nonDefaultAccount.id}")
                    return nonDefaultAccount
                }
            }
        }

        // 5. Safe fallback to system default outgoing account rather than guessing
        return defaultHandle ?: callAccounts.firstOrNull()
    }
}
