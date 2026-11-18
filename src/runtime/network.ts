import { execFileSync } from 'node:child_process';
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';
import { CliError } from '../shared/errors.js';

interface SystemProxy { ProxyEnable?: number; ProxyServer?: string }
interface ProxyOptions { httpProxy: string; httpsProxy: string; noProxy: string }

function readWindowsProxy(): SystemProxy {
  try {
    const value = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' | Select-Object ProxyEnable,ProxyServer | ConvertTo-Json -Compress",
    ], { encoding: 'utf8', windowsHide: true, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(value) as SystemProxy;
  } catch { return {}; }
}

function proxyUrl(value: string): string {
  if (!value) return '';
  try {
    const url = new URL(value.includes('://') ? value : `http://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error();
    return url.href;
  } catch {
    // Proxy URLs can contain credentials: never include the value in diagnostics.
    throw new CliError('INPUT', '代理地址无效；请配置 HTTP(S)_PROXY，或设置 JUEJIN_SYSTEM_PROXY=0 禁用系统代理读取。');
  }
}

export function resolveProxyOptions(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  readSystemProxy: () => SystemProxy = readWindowsProxy,
): ProxyOptions {
  let http = env.http_proxy ?? env.HTTP_PROXY;
  let https = env.https_proxy ?? env.HTTPS_PROXY;
  const noProxy = env.no_proxy ?? env.NO_PROXY ?? '';
  // Explicit environment settings (including empty strings) override Windows settings.
  if (http === undefined && https === undefined && platform === 'win32' && env.JUEJIN_SYSTEM_PROXY !== '0' && noProxy !== '*') {
    const settings = readSystemProxy();
    const server = settings.ProxyServer?.trim();
    if (settings.ProxyEnable === 1 && server) {
      if (/^(?:http|https|ftp|socks)=/i.test(server)) {
        const entries = Object.fromEntries(server.split(';').map(entry => {
          const separator = entry.indexOf('=');
          return [entry.slice(0, separator).trim().toLowerCase(), entry.slice(separator + 1).trim()];
        }));
        http = entries.http;
        https = entries.https;
        if (!http && !https) throw new CliError('INPUT', '系统代理未配置 HTTP(S) 代理；请设置 HTTPS_PROXY。');
      } else http = https = server;
    }
  }
  return { httpProxy: proxyUrl(http ?? ''), httpsProxy: proxyUrl(https ?? http ?? ''), noProxy };
}

export function createNetworkTransport(options = resolveProxyOptions()) {
  const dispatcher = new EnvHttpProxyAgent(options);
  // Use matching Undici fetch/dispatcher versions across all supported Node releases.
  const fetch: typeof globalThis.fetch = (input, init) => undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    { ...init, dispatcher } as Parameters<typeof undiciFetch>[1],
  ) as unknown as Promise<Response>;
  return { fetch, close: () => dispatcher.close() };
}

let transport: ReturnType<typeof createNetworkTransport> | undefined;
export const networkFetch: typeof globalThis.fetch = (input, init) => {
  transport ??= createNetworkTransport();
  return transport.fetch(input, init);
};
