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

  public init(port: number): void {
    this.port = port;

    // Check if user specified a custom public domain in .env
    const customDomain = process.env.PUBLIC_BASE_URL || process.env.PUBLIC_DOMAIN || process.env.PUBLIC_URL || '';
    if (customDomain) {
      this.state = {
        enabled: true,
        publicUrl: customDomain.startsWith('http') ? customDomain : `https://${customDomain}`,
        provider: 'custom',
        connectedAt: new Date().toISOString(),
        error: null
      };
      console.log(`[Tunnel] Configured Custom Public URL: ${this.state.publicUrl}`);
      return;
    }

    // Automatically launch Cloudflare Quick Tunnel by default
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
  }

  public async startCloudflareTunnel(): Promise<string | null> {
    if (this.state.publicUrl && this.state.provider === 'cloudflare') {
      return this.state.publicUrl;
    }

    return new Promise((resolve) => {
      console.log(`[Tunnel] Launching Cloudflare Quick Tunnel for port ${this.port}...`);

      const cloudflaredPath = path.resolve(__dirname, '../bin/cloudflared.exe');
      const hasBinary = fs.existsSync(cloudflaredPath);

      const command = hasBinary ? cloudflaredPath : 'npx';
      const args = hasBinary
        ? ['tunnel', '--url', `http://127.0.0.1:${this.port}`, '--no-autoupdate']
        : ['-y', 'localtunnel', '--port', String(this.port)];

      try {
        const proc = spawn(command, args, {
          shell: !hasBinary,
          windowsHide: true
        });

        this.tunnelProcess = proc;
        let resolved = false;

        const handleOutput = (data: Buffer) => {
          const text = data.toString();
          // Match actual dynamic trycloudflare.com or loca.lt subdomains (exclude internal api.trycloudflare.com)
          const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/) || text.match(/https:\/\/[a-zA-Z0-9-]+\.loca\.lt/);
          if (match && !resolved) {
            const candidateUrl = match[0];
            if (candidateUrl.includes('api.trycloudflare.com') || candidateUrl.includes('pkg.trycloudflare.com') || candidateUrl.includes('update.trycloudflare.com')) {
              return;
            }
            resolved = true;
            this.state = {
              enabled: true,
              publicUrl: candidateUrl,
              provider: hasBinary ? 'cloudflare' : 'localtunnel',
              connectedAt: new Date().toISOString(),
              error: null
            };
            console.log(`[Tunnel] ✅ Global Public HTTPS URL Active: ${candidateUrl}`);
            resolve(candidateUrl);
          }
        };

        proc.stdout?.on('data', handleOutput);
        proc.stderr?.on('data', handleOutput);

        proc.on('close', (code) => {
          console.log(`[Tunnel] Tunnel process closed with exit code ${code}`);
          this.state.enabled = false;
          this.state.publicUrl = null;
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        });

        // 15-second timeout fallback
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            this.state.enabled = false;
            this.state.publicUrl = null;
            console.log('[Tunnel] Tunnel negotiation timeout. Using LAN fallback.');
            resolve(null);
          }
        }, 15000);

      } catch (err: any) {
        console.warn('[Tunnel] Could not launch tunnel provider:', err.message);
        this.state.error = err.message;
        resolve(null);
      }
    });
  }

  public stopTunnel(): void {
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
