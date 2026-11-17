import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect, type AddressInfo, type Socket } from 'node:net';
import { once } from 'node:events';
import { createNetworkTransport, resolveProxyOptions } from '../src/runtime/network.js';

test('explicit environment proxies take precedence over Windows; URLs are not logged', () => {
  const unexpected = () => { throw new Error('must not read Windows settings'); };
  assert.deepEqual(resolveProxyOptions({ http_proxy: 'localhost:1234', HTTP_PROXY: 'localhost:4321', NO_PROXY: '.example.com' }, 'win32', unexpected),
    { httpProxy: 'http://localhost:1234/', httpsProxy: 'http://localhost:1234/', noProxy: '.example.com' });
  assert.equal(resolveProxyOptions({ HTTPS_PROXY: '' }, 'win32', unexpected).httpsProxy, '');
  assert.equal(resolveProxyOptions({ JUEJIN_SYSTEM_PROXY: '0' }, 'win32', unexpected).httpProxy, '');
  assert.equal(resolveProxyOptions({ NO_PROXY: '*' }, 'win32', unexpected).httpProxy, '');
  assert.equal(resolveProxyOptions({}, 'linux', unexpected).httpProxy, '');
  assert.throws(() => resolveProxyOptions({ HTTPS_PROXY: 'socks5://user:secret@localhost:1080' }), error => {
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes('secret'));
    return true;
  });
});

test('Windows static proxies support single and per-protocol settings', () => {
  assert.deepEqual(resolveProxyOptions({}, 'win32', () => ({ ProxyEnable: 1, ProxyServer: '127.0.0.1:12450' })),
    { httpProxy: 'http://127.0.0.1:12450/', httpsProxy: 'http://127.0.0.1:12450/', noProxy: '' });
  assert.deepEqual(resolveProxyOptions({}, 'win32', () => ({ ProxyEnable: 1, ProxyServer: 'http=localhost:1001;https=localhost:1002' })),
    { httpProxy: 'http://localhost:1001/', httpsProxy: 'http://localhost:1002/', noProxy: '' });
  assert.equal(resolveProxyOptions({}, 'win32', () => ({ ProxyEnable: 0, ProxyServer: 'localhost:12450' })).httpProxy, '');
  assert.throws(() => resolveProxyOptions({}, 'win32', () => ({ ProxyEnable: 1, ProxyServer: 'socks=localhost:1080' })), /HTTP/);
});

test('proxy transport sends a write once, keeps origin credentials out of CONNECT, and honors NO_PROXY', async () => {
  let requests = 0;
  const tunnels: { url?: string; cookie?: string }[] = [];
  const sockets = new Set<Socket>();
  const target = createServer(async (request, response) => {
    requests++;
    let body = '';
    for await (const chunk of request) body += chunk;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ body, cookie: request.headers.cookie }));
  });
  const proxy = createServer();
  proxy.on('connect', (request, socket, head) => {
    tunnels.push({ url: request.url, cookie: request.headers.cookie });
    const upstream = connect((target.address() as AddressInfo).port, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket); socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
    sockets.add(upstream); sockets.add(socket);
  });
  target.listen(0, '127.0.0.1'); await once(target, 'listening');
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  const proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  const url = `http://127.0.0.1:${(target.address() as AddressInfo).port}`;
  const transport = createNetworkTransport(resolveProxyOptions({ HTTP_PROXY: proxyUrl }, 'linux'));
  const direct = createNetworkTransport(resolveProxyOptions({ HTTP_PROXY: proxyUrl, NO_PROXY: '127.0.0.1' }, 'linux'));
  try {
    const response = await transport.fetch(url, { method: 'POST', body: 'payload', headers: { Cookie: 'sessionid=fabricated' }, signal: AbortSignal.timeout(5000) });
    assert.deepEqual(await response.json(), { body: 'payload', cookie: 'sessionid=fabricated' });
    assert.equal(requests, 1);
    assert.equal(tunnels.length, 1);
    assert.equal(tunnels[0].cookie, undefined);
    await (await direct.fetch(url, { signal: AbortSignal.timeout(5000) })).text();
    assert.equal(requests, 2);
    assert.equal(tunnels.length, 1);
  } finally {
    await Promise.all([transport.close(), direct.close()]);
    for (const socket of sockets) socket.destroy();
    target.closeAllConnections(); proxy.closeAllConnections();
    await Promise.all([new Promise<void>(resolve => target.close(() => resolve())), new Promise<void>(resolve => proxy.close(() => resolve()))]);
  }
});
