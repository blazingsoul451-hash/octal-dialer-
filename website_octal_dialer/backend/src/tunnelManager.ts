import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface TunnelState {
  enabled: boolean;
  publicUrl: string | null;
  provider: 'cloudflare' | 'localtunnel' | 'custom' | 'lan';
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

    // 2. Automatically launch and supervise Free Public Tunnel ($0)
    this.startTunnel('cloudflare');
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

  public async startTunnel(provider: 'cloudflare' | 'localtunnel' = 'cloudflare'): Promise<string | null> {
    if (this.state.publicUrl && this.tunnelProcess && !this.tunnelProcess.killed) {
      return this.state.publicUrl;
    }

    const cloudflaredPath = path.resolve(__dirname, '../bin/cloudflared.exe');
    const isCloudflare = provider === 'cloudflare' && fs.existsSync(cloudflaredPath);

    console.log(`[Tunnel] Launching $0 Public Quick Tunnel (${isCloudflare ? 'cloudflare' : 'localtunnel'}) for port ${this.port}...`);

    return new Promise((resolve) => {
      try {
        const isWin = process.platform === 'win32';
        const command = isCloudflare ? cloudflaredPath : (isWin ? 'npx.cmd' : 'npx');
        const args = isCloudflare
          ? ['tunnel', '--url', `http://127.0.0.1:${this.port}`, '--no-autoupdate']
          : ['-y', 'localtunnel', '--port', String(this.port)];

        const proc = spawn(command, args, {
          shell: isWin && !isCloudflare,
          windowsHide: true
        });

        this.tunnelProcess = proc;
        let resolved = false;

        const handleOutput = (data: Buffer) => {
          const text = data.toString();
          const matches = Array.from(text.matchAll(/https:\/\/(?!api\b|pkg\b|update\b)[a-zA-Z0-9-]+\.(trycloudflare\.com|loca\.lt)/g));
          const locaLtMatch = text.match(/your url is:\s*(https:\/\/[^\s]+)/i);

          const foundUrl = matches.length > 0 ? matches[0][0].trim() : (locaLtMatch ? locaLtMatch[1].trim() : null);

          if (foundUrl && !resolved) {
            resolved = true;
            this.state = {
              enabled: true,
              publicUrl: foundUrl,
              provider: isCloudflare ? 'cloudflare' : 'localtunnel',
              connectedAt: new Date().toISOString(),
              error: null
            };
            console.log(`[Tunnel] ✅ Global Public HTTPS URL Active: ${foundUrl} (${this.state.provider})`);
            
            // Broadcast new URL across live Socket.IO connections to web dashboards
            if (this.ioInstance) {
              this.ioInstance.emit('tunnel:updated', { 
                serverUrl: foundUrl, 
                status: 'CONNECTED', 
                provider: this.state.provider 
              });
            }

            for (const cb of this.urlChangeListeners) {
              try { cb(foundUrl); } catch (_) {}
            }

            resolve(foundUrl);
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
            // Fallback immediately if cloudflare quick tunnel failed
            if (isCloudflare) {
              console.log('[Tunnel] Cloudflare Quick Tunnel unavailable, falling back to localtunnel...');
              this.startTunnel('localtunnel').then(resolve);
              return;
            }
            resolve(null);
          }

          // Auto-recovery / crash restart with backoff if backend is alive
          if (!this.explicitlyStopped) {
            console.log('[Tunnel] Auto-reconnecting Quick Tunnel in 3s...');
            if (this.restartTimeout) clearTimeout(this.restartTimeout);
            this.restartTimeout = setTimeout(() => {
              if (!this.explicitlyStopped) {
                this.startTunnel(isCloudflare ? 'cloudflare' : 'localtunnel');
              }
            }, 3000);
          }
        });

      } catch (err: any) {
        console.warn('[Tunnel] Could not launch tunnel process:', err.message);
        this.state.error = err.message;
        if (isCloudflare) {
          this.startTunnel('localtunnel').then(resolve);
        } else {
          resolve(null);
        }
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
