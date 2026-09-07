import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';

export interface ApkSyncResult {
  freshestPath: string;
  mtime: number;
  size: number;
  sha256: string;
  syncedTo: string[];
}

export class ApkWatcher {
  private static instance: ApkWatcher | null = null;
  private watchDirs: string[];
  private targetDestinations: string[];
  private lastProcessedMtime = 0;
  private isProcessing = false;
  private io: SocketIOServer | null = null;
  private db: any = null;
  private currentVersion = '1.4.0';
  private currentBuildNumber = 4;

  constructor() {
    this.watchDirs = [
      path.resolve(__dirname, '../../application_octal_dialer/build/app/outputs/flutter-apk'),
      path.resolve(__dirname, '../../mobile/build/app/outputs/flutter-apk')
    ];

    this.targetDestinations = [
      path.resolve(__dirname, '../data/OctalDialer.apk'),
      path.resolve(__dirname, '../../frontend/public/OctalDialer.apk')
    ];

    if (process.platform === 'win32' && process.env.USERPROFILE) {
      this.targetDestinations.push(path.resolve(process.env.USERPROFILE, 'Desktop/OctalDialer.apk'));
    } else if (process.platform === 'linux') {
      const nginxApk = '/var/www/octal-frontend/OctalDialer.apk';
      if (fs.existsSync(path.dirname(nginxApk))) {
        this.targetDestinations.push(nginxApk);
      }
    }
  }

  public static getInstance(): ApkWatcher {
    if (!ApkWatcher.instance) {
      ApkWatcher.instance = new ApkWatcher();
    }
    return ApkWatcher.instance;
  }

  public init(io: SocketIOServer, db: any): void {
    this.io = io;
    this.db = db;

    // Initial sync scan on startup
    this.syncFreshestApk().catch(err => console.warn('[APK Watcher] Initial sync error:', err));

    // Start watching build directories
    this.startWatching();
  }

  public async syncFreshestApk(): Promise<ApkSyncResult | null> {
    if (this.isProcessing) return null;
    this.isProcessing = true;

    try {
      const candidates = [
        path.resolve(__dirname, '../../application_octal_dialer/build/app/outputs/flutter-apk/app-release.apk'),
        path.resolve(__dirname, '../../application_octal_dialer/build/app/outputs/flutter-apk/app-debug.apk'),
        path.resolve(__dirname, '../data/OctalDialer.apk')
      ];

      if (process.platform === 'win32' && process.env.USERPROFILE) {
        candidates.push(path.resolve(process.env.USERPROFILE, 'Desktop/OctalDialer.apk'));
      }

      const validFiles = candidates
        .filter(p => {
          try { return fs.existsSync(p); } catch { return false; }
        })
        .map(p => {
          try {
            const stat = fs.statSync(p);
            return { path: p, mtime: stat.mtimeMs, size: stat.size };
          } catch {
            return null;
          }
        })
        .filter((item): item is { path: string; mtime: number; size: number } => item !== null && item.size > 1000000)
        .sort((a, b) => b.mtime - a.mtime);

      if (validFiles.length === 0) {
        this.isProcessing = false;
        return null;
      }

      const freshest = validFiles[0];

      // If already processed this exact build timestamp, skip redundant copy
      if (freshest.mtime === this.lastProcessedMtime) {
        this.isProcessing = false;
        return null;
      }

      // Compute SHA-256 Hash
      const fileBuffer = fs.readFileSync(freshest.path);
      const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      const syncedTo: string[] = [];

      for (const dest of this.targetDestinations) {
        if (dest !== freshest.path) {
          try {
            const dir = path.dirname(dest);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            
            // Only overwrite if destination doesn't exist or is older
            let needsCopy = true;
            if (fs.existsSync(dest)) {
              const destStat = fs.statSync(dest);
              if (destStat.mtimeMs >= freshest.mtime && destStat.size === freshest.size) {
                needsCopy = false;
              }
            }

            if (needsCopy) {
              fs.copyFileSync(freshest.path, dest);
              syncedTo.push(dest);
            }
          } catch (err) {
            console.warn(`[APK Watcher] Could not sync to ${dest}:`, err);
          }
        }
      }

      // Record in PostgreSQL OTA table safely
      if (this.db) {
        try {
          const existing = await this.db.queryOne('SELECT id FROM ota_versions WHERE version = $1', [this.currentVersion]);
          if (existing) {
            await this.db.execute(`
              UPDATE ota_versions 
              SET "apkHash" = $1, "uploadedAt" = now(), "buildNumber" = $2 
              WHERE version = $3
            `, [sha256, this.currentBuildNumber, this.currentVersion]);
          } else {
            await this.db.execute(`
              INSERT INTO ota_versions (id, version, "buildNumber", "apkHash", signature, "releaseNotes", "isActive")
              VALUES ($1, $2, $3, $4, 'OCTAL_KEY_SIG_V1', 'Automatic production build sync.', 1)
            `, [`ota_v${this.currentVersion}`, this.currentVersion, this.currentBuildNumber, sha256]);
          }
        } catch (dbErr) {
          // Non-fatal logging
        }
      }

      this.lastProcessedMtime = freshest.mtime;

      if (syncedTo.length > 0) {
        console.log(`[APK Watcher] ✅ Auto-synced new build (${(freshest.size / (1024 * 1024)).toFixed(1)} MB) from ${freshest.path}`);
        console.log(`[APK Watcher] Synced targets: ${syncedTo.join(', ')}`);
        
        // Broadcast WebSocket OTA event
        if (this.io) {
          this.io.emit('ota:update_available', {
            version: this.currentVersion,
            buildNumber: this.currentBuildNumber,
            sha256,
            downloadUrl: '/download/apk',
            timestamp: new Date().toISOString()
          });
        }
      }

      this.isProcessing = false;
      return {
        freshestPath: freshest.path,
        mtime: freshest.mtime,
        size: freshest.size,
        sha256,
        syncedTo
      };
    } catch (err) {
      console.error('[APK Watcher] Error during sync:', err);
      this.isProcessing = false;
      return null;
    }
  }

  private startWatching(): void {
    for (const dir of this.watchDirs) {
      try {
        if (fs.existsSync(dir)) {
          fs.watch(dir, { recursive: false }, (_eventType, filename) => {
            if (filename && filename.toLowerCase().endsWith('.apk')) {
              console.log(`[APK Watcher] Detected change in ${dir}: ${filename}`);
              // Debounce 1.5s to ensure Flutter has finished writing the binary
              setTimeout(() => this.syncFreshestApk(), 1500);
            }
          });
        }
      } catch (watchErr) {
        console.warn(`[APK Watcher] Notice: Could not watch directory ${dir}:`, watchErr);
      }
    }

    // Periodic safety poll every 30s in case OS watcher drops events
    setInterval(() => {
      this.syncFreshestApk();
    }, 30000);
  }
}

export const apkWatcher = ApkWatcher.getInstance();
