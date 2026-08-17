import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface TunnelState {
  enabled: boolean;
  publicUrl: string | null;
  provider: 'cloudflare' | 'custom' | 'lan';
  connectedAt: string | null;
  error: string | null;
}

export class TunnelManager {
  private static instance: TunnelManager | null = null;
  private tunnelProcess: ChildProcess | null = null;
  private ioInstance: any = null;
  private explicitlyStopped = false;
  private restartTimeout: any = null;
  private urlChangeListeners: ((url: string) => void)[] = [];

  private state: TunnelState = {
    enabled: false,
    publicUrl: null,
    provider: 'lan',
    connectedAt: null,
    error: null
  };
  private port: number = 3000;

  public static getInstance(): TunnelManager {
    if (!TunnelManager.instance) {
      TunnelManager.instance = new TunnelManager();
    }
    return TunnelManager.instance;
  }

  public attachSocketIO(io: any): void {
    this.ioInstance = io;
  }

  public onUrlChange(callback: (url: string) => void): void {
    this.urlChangeListeners.push(callback);
  }

  public init(port: number): void {
    this.port = port;
    this.explicitlyStopped = false;

    // 1. Check if user specified a canonical public domain or permanent tunnel in environment
    const canonicalDomain = process.env.DEVICE_SERVER_URL || process.env.PUBLIC_BASE_URL || process.env.PUBLIC_DOMAIN || process.env.PUBLIC_URL || '';
    if (canonicalDomain) {
      this.state = {
        enabled: true,
        publicUrl: canonicalDomain.startsWith('http') ? canonicalDomain : `https://${canonicalDomain}`,
        provider: 'custom',
        connectedAt: new Date().toISOString(),
        error: null
      };
      console.log(`[Tunnel] Configured Canonical Public URL: ${this.state.publicUrl}`);
      return;
    }

    // 2. Automatically launch and supervise Free Cloudflare Quick Tunnel ($0)
    this.startCloudflareTunnel();
  }

  public getState(): TunnelState {
    return { ...this.state };
  }

  public getPublicUrl(): string | null {
    return this.state.publicUrl;
  }

  public setCustomUrl(url: string): void {
    const formatted = url.startsWith('http') ? url : `https://${url}`;
    this.state = {
      enabled: true,
      publicUrl: formatted,
      provider: 'custom',
      connectedAt: new Date().toISOString(),
      error: null
    };
    if (this.ioInstance) {
      this.ioInstance.emit('tunnel:updated', { serverUrl: formatted, status: 'CONNECTED', provider: 'custom' });
    }
  }

  public async startCloudflareTunnel(): Promise<string | null> {
    if (this.state.publicUrl && this.tunnelProcess && !this.tunnelProcess.killed) {
      return this.state.publicUrl;
    }

    const cloudflaredPath = path.resolve(__dirname, '../bin/cloudflared.exe');
    if (!fs.existsSync(cloudflaredPath)) {
      console.warn(`[Tunnel] cloudflared.exe binary not found at ${cloudflaredPath}. Using LAN mode.`);
      return null;
    }

    console.log(`[Tunnel] Launching Cloudflare Quick Tunnel for port ${this.port}...`);

    return new Promise((resolve) => {
      try {
        const proc = spawn(cloudflaredPath, ['tunnel', '--url', `http://127.0.0.1:${this.port}`, '--no-autoupdate'], {
          shell: false,
          windowsHide: true
        });

        this.tunnelProcess = proc;
        let resolved = false;

        const handleOutput = (data: Buffer) => {
          const text = data.toString();
          const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);

          if (match && !resolved) {
            const candidateUrl = match[0].trim();
            if (candidateUrl.includes('api.trycloudflare.com') || candidateUrl.includes('pkg.trycloudflare.com') || candidateUrl.includes('update.trycloudflare.com')) {
              return;
            }
            resolved = true;
            this.state = {
              enabled: true,
              publicUrl: candidateUrl,
              provider: 'cloudflare',
              connectedAt: new Date().toISOString(),
              error: null
            };
            console.log(`[Tunnel] ✅ Global Public HTTPS URL Active: ${candidateUrl}`);
            
            // Broadcast new URL across live Socket.IO connections to web dashboards
            if (this.ioInstance) {
              this.ioInstance.emit('tunnel:updated', { 
                serverUrl: candidateUrl, 
                status: 'CONNECTED', 
                provider: 'cloudflare' 
              });
            }

            for (const cb of this.urlChangeListeners) {
              try { cb(candidateUrl); } catch (_) {}
            }

            resolve(candidateUrl);
          }
        };

        proc.stdout?.on('data', handleOutput);
        proc.stderr?.on('data', handleOutput);

        proc.on('close', (code) => {
          this.state.enabled = false;
          this.state.publicUrl = null;

          if (this.ioInstance) {
            this.ioInstance.emit('tunnel:updated', { serverUrl: null, status: 'DISCONNECTED' });
          }

          if (!resolved) {
            resolved = true;
            resolve(null);
          }

          // Auto-recovery / crash restart with backoff if backend is alive
          if (!this.explicitlyStopped) {
            console.log('[Tunnel] Auto-reconnecting Cloudflare Quick Tunnel in 3s...');
            if (this.restartTimeout) clearTimeout(this.restartTimeout);
            this.restartTimeout = setTimeout(() => {
              if (!this.explicitlyStopped) {
                this.startCloudflareTunnel();
              }
            }, 3000);
          }
        });

      } catch (err: any) {
        console.warn('[Tunnel] Could not launch cloudflared process:', err.message);
        this.state.error = err.message;
        resolve(null);
      }
    });
  }

  public stopTunnel(): void {
    this.explicitlyStopped = true;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.tunnelProcess) {
      try {
        this.tunnelProcess.kill();
      } catch (_) {}
      this.tunnelProcess = null;
    }
    this.state = {
      enabled: false,
      publicUrl: null,
      provider: 'lan',
      connectedAt: null,
      error: null
    };
  }
}

export const tunnelManager = TunnelManager.getInstance();
