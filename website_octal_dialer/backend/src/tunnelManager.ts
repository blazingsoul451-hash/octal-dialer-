import { spawn, ChildProcess } from 'child_process';
import http from 'http';

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
    const customDomain = process.env.PUBLIC_DOMAIN || process.env.PUBLIC_URL || '';
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

    // If AUTO_TUNNEL is explicitly set to true in .env, start tunnel
    if (process.env.AUTO_TUNNEL === 'true') {
      this.startCloudflareTunnel();
    }
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
      console.log('[Tunnel] Launching Cloudflare Quick Tunnel for port ' + this.port + '...');
      
      // Try spawning cloudflared if available in PATH or local tools
      try {
        const proc = spawn('npx', ['-y', 'localtunnel', '--port', String(this.port)], {
          shell: true,
          windowsHide: true
        });

        this.tunnelProcess = proc;

        let resolved = false;

        proc.stdout?.on('data', (data: Buffer) => {
          const text = data.toString();
          const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.loca\.lt/) || text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
          if (match && !resolved) {
            resolved = true;
            const url = match[0];
            this.state = {
              enabled: true,
              publicUrl: url,
              provider: 'localtunnel',
              connectedAt: new Date().toISOString(),
              error: null
            };
            console.log(`[Tunnel] ✅ Public HTTPS Tunnel Active: ${url}`);
            resolve(url);
          }
        });

        proc.stderr?.on('data', (data: Buffer) => {
          const errText = data.toString();
          if (errText.includes('error') && !resolved) {
            this.state.error = errText;
          }
        });

        proc.on('close', (code) => {
          console.log(`[Tunnel] Tunnel process exited with code ${code}`);
          this.state.enabled = false;
          this.state.publicUrl = null;
        });

        // 12-second timeout fallback to LAN mode if tunnel cannot be spawned
        setTimeout(() => {
          if (!resolved) {
            console.log('[Tunnel] Tunnel initialization timed out, using local network mode.');
            resolve(null);
          }
        }, 12000);

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
