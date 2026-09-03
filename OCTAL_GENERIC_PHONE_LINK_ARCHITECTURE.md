# OCTAL DIALER — GENERIC ANDROID + LAPTOP CALLING PLATFORM
## Vendor-Agnostic Architecture & Call Audio Transport Abstraction Layer

**Target:** Universal Android (AOSP API 26–35) + Cross-Platform Laptop Audio Endpoints  
**Hardware Verification Node #1:** Redmi Note 13 4G (Test Device only, no vendor-specific architectural coupling)

---

## 1. CORE ARCHITECTURAL PRINCIPLES

1. **Strict Vendor Independence:**
   - The platform must function identically across all major Android manufacturers: **Google Pixel, Samsung, Xiaomi/Redmi, OnePlus, Oppo, Vivo, Motorola**, etc.
   - Standard AOSP Public APIs only (`android.telephony.*`, `android.telecom.*`, `android.media.*`, `android.bluetooth.*`).
   - Zero private reflection into proprietary OEM frameworks (`com.miui.*`, `com.samsung.*`, etc.).
   - Zero hardcoded device models, manufacturer names, or dummy MAC addresses (`48:D2:24:D3:5F:AA`, `00:1A:7D:DA:71:11`).

2. **Decoupled Control & Audio Planes:**
   - **Control Plane (Signaling):** Laptop Browser <-> WebSocket (Socket.IO) <-> Backend <-> Android App <-> Android Telephony <-> Physical SIM.
   - **Audio Plane (Voice Stream):** Laptop Audio Endpoint <-> CallAudioTransport <-> Cellular Modem Call Audio Stream.

3. **Honest Capability Telemetry:**
   - The Android app dynamically probes the hardware stack and reports distinct capability flags to the backend and web dashboard.
   - Bluetooth connection state is NEVER equated to active call audio routing.

---

## 2. HARDWARE CAPABILITY DETECTION PIPELINE

The Android app executes a 4-stage capability inspection:
1. **Telephony Check:** Active SIM & cellular hardware verified.
2. **Bluetooth Hardware Check:** Adapter present and enabled.
3. **HFP Profile Check:** Hands-Free Profile connection state with laptop.
4. **Audio Route Check:** AudioManager SCO audio link state.

### Authoritative Capability Telemetry Schema:
```json
{
  "deviceUid": "c9a4b2e1-8f3a-4b12-9c3d-e7f1a2b3c4d5",
  "manufacturer": "Google",
  "model": "Pixel 8 Pro",
  "osVersion": "14",
  "apiLevel": 34,
  "capabilities": {
    "gsmCallSupported": true,
    "bluetoothHfpSupported": true,
    "bluetoothHfpConnected": true,
    "callAudioRouteState": "CALL_AUDIO_ROUTE_AVAILABLE"
  }
}
```

---

## 3. CallAudioTransport ABSTRACTION LAYER

```kotlin
package com.octal.dialer.transport

import android.content.Context

enum class AudioRouteState {
    CALL_AUDIO_ROUTE_AVAILABLE,
    CALL_AUDIO_ROUTE_UNAVAILABLE,
    CALL_AUDIO_ROUTE_UNSUPPORTED
}

interface AudioRouteListener {
    fun onAudioRouteChanged(newState: AudioRouteState, details: String)
}

interface CallAudioTransport {
    val transportId: String
    val transportName: String
    val isSupported: Boolean
    val isConnected: Boolean
    val currentAudioRouteState: AudioRouteState

    fun initialize(context: Context, listener: AudioRouteListener)
    fun activateCallAudioRoute(): Boolean
    fun deactivateCallAudioRoute()
    fun release()
}
```

### Transport Implementations

1. **BluetoothHFPTransport (Standard Implementation):**
   - Uses standard Android `AudioManager.startBluetoothSco()` and `BluetoothHeadset` service listener.
   - Routes cellular baseband audio directly to laptop soundcard over 16kHz mSBC / 8kHz CVSD hardware channels.
   - Supported natively on Windows (Phone Link / Bluetooth Audio), Linux (PipeWire / BlueZ HFP sink), and macOS (with HFP sink receiver).

2. **HardwareAudioBridgeTransport (TRRS/USB-C Implementation):**
   - Physical 3.5mm TRRS or USB-C Audio Class bridge between phone headset jack and laptop audio in/out.
   - Universally supported across 100% of all devices with zero wireless compression.

3. **BrowserAudioTransport (Explicitly Documented Platform Limitation):**
   - Standard Android OS strictly blocks 3rd-party non-ROM applications from capturing raw cellular downlink audio (`CAPTURE_AUDIO_OUTPUT` is restricted to system ROM signatures).
   - Classified as `NOT_SUPPORTED_FOR_CELLULAR_GSM` to prevent deceptive UI states.

---

## 4. DEVICE COMPATIBILITY MATRIX

| Android OS Version | OEM / Manufacturer | Telephony APIs Used | Bluetooth HFP Availability | Call Audio Routing Feasibility | Known OS Restrictions | Platform Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Android 14 / 15** | **Google Pixel** (7, 8, 9) | TelephonyCallback, TelecomManager | High (AOSP Bluetooth stack) | Standard SCO (AudioManager.startBluetoothSco) | Strict SELinux; incoming number masked without READ_CALL_LOG. | **SUPPORTED** |
| **Android 13 / 14** | **Samsung** (One UI 5/6) | TelephonyCallback, TelecomManager | High (Samsung custom stack supports standard HFP) | Standard SCO / setCommunicationDevice | Samsung Smart Manager may sleep background apps if not set to "Unrestricted". | **SUPPORTED** |
| **Android 12 / 13 / 14** | **Xiaomi / Redmi / Poco** (MIUI / HyperOS) | TelephonyCallback, TelecomManager | High | Standard SCO | Requires manual battery permission ("No restrictions") to avoid background freeze. | **SUPPORTED** *(Test Device #1)* |
| **Android 12 / 13 / 14** | **OnePlus / Oppo / Realme** (ColorOS / OxygenOS) | TelephonyCallback, TelecomManager | High | Standard SCO | Aggressive background task freezer; requires "Allow background activity". | **SUPPORTED** |
| **Android 12 / 13 / 14** | **Vivo / iQOO** (Funtouch / OriginOS) | TelephonyCallback, TelecomManager | Moderate | Standard SCO | Custom permission dialogs for autostart and background floating windows. | **PARTIALLY SUPPORTED** |
| **Android 11 / 12 / 13 / 14** | **Motorola** (My UX / Hello UI) | TelephonyCallback, TelecomManager | High (Near-stock AOSP) | Standard SCO | Minimal restrictions; standard AOSP behavior. | **SUPPORTED** |
| **Android 8.0 – 10** | **Legacy Devices (Any OEM)** | PhoneStateListener fallback | Moderate (Bluetooth 4.2 / 5.0) | Deprecated startBluetoothSco | Lacks modern TelephonyCallback; uses legacy listener fallback. | **PARTIALLY SUPPORTED** |
| **Tablets / Wi-Fi Only** | **Any OEM** | None (No SIM hardware) | Moderate | N/A | No physical GSM modem. | **NOT SUPPORTED (No SIM)** |

---

## 5. LAPTOP-SIDE ENDPOINT ABSTRACTION

The web dashboard is designed to be cross-platform (Windows, macOS, Linux) without assuming a specific operating system or laptop model:
- **Audio Endpoint Layer:** Dynamically enumerates available microphones and speakers via `navigator.mediaDevices.enumerateDevices()`.
- **Signaling Layer:** Communicates over platform-agnostic WebSockets.
- **De-Hardcoded Telemetry:** Displays real device names and actual audio link states instead of dummy MAC addresses.
