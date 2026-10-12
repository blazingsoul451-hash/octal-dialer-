# Octal Desktop Agent (Edge Worker)

Distributed automation client designed for **Octal Dialer & Marketing SaaS**.

---

## 🎯 Purpose & Architecture

### 1. Zero Cloud Server Load (Edge Computing)
- Cloud VPS / Datacenter servers (Oracle Cloud, AWS, DigitalOcean) get overloaded when running dozens of headless browsers simultaneously.
- **Octal Desktop Agent** delegates browser automation (Facebook Auto-Poster) and direct email jobs to each user's local workstation.
- Server CPU load drops to **0.0%**.

### 2. Eliminating Account Bans (Residential IP & Anti-Fingerprinting)
- Datacenter IPs (ASNs belonging to Oracle, AWS, Hetzner, etc.) are instantly flagged by Meta and Google security systems.
- Running automation from the user's home/office PC uses their **natural residential ISP IP**.
- Uses native Microsoft Edge / WebView2 on Windows with natural human typing speed, randomized delays (5–12 mins), and organic DOM mouse events.

### 3. No Browser Extensions Required
- Instead of requiring users to install third-party Chrome extensions (which get removed or blocked by Chrome Web Store policies), the desktop app provides a **1-Click Connect Facebook** button.
- It launches a local Edge session, detects successful login (`c_user` cookie), captures the session state, and saves it locally.

### 4. Strictly Isolated from Mobile App (Zero iOS/Android Conflicts)
- The mobile app (`application_octal_dialer`) remains 100% untouched and pure Flutter mobile (iOS + Android).
- No desktop dependencies pollute the mobile build tree, preventing any iOS build or CocoaPods issues.

---

## 🚀 How to Run

1. **Quick Start (Batch Launcher):**
   Double-click `start_desktop_agent.cmd`

2. **Flutter Run:**
   ```bash
   cd desktop_octal_agent
   flutter run -d windows
   ```

3. **Standalone Local Engine:**
   ```bash
   cd desktop_octal_agent/local_engine
   npm install
   node local_cookie_grabber.js --profile My_FB_Account
   node local_fb_bot.js --config ./data/campaign_config.json
   ```
