import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TARGET_PORT = parseInt(process.env.PORT || '3001', 10);
const HTTPS_PORT = parseInt(process.env.SCC_HTTPS_PORT || '3443', 10);
const CERT_DIR = path.resolve(process.cwd(), '.data', 'certs');
const KEY_PATH = path.join(CERT_DIR, 'localhost.key');
const CERT_PATH = path.join(CERT_DIR, 'localhost.crt');

export function createLoopbackProxy(options?: {
  targetPort?: number;
  httpsPort?: number;
  keyPath?: string;
  certPath?: string;
}) {
  const targetPort = options?.targetPort !== undefined ? options.targetPort : TARGET_PORT;
  const httpsPort = options?.httpsPort !== undefined ? options.httpsPort : HTTPS_PORT;
  const keyPath = options?.keyPath || KEY_PATH;
  const certPath = options?.certPath || CERT_PATH;

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    throw new Error(
      `TLS certificates not found. Ensure ${keyPath} and ${certPath} exist before starting loopback HTTPS proxy.`
    );
  }

  const tlsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };

  const server = https.createServer(tlsOptions, (clientReq, clientRes) => {
    // Strictly verify loopback caller
    const remoteAddress = clientReq.socket.remoteAddress || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress)) {
      clientRes.writeHead(403, { 'Content-Type': 'application/json' });
      clientRes.end(JSON.stringify({ error: 'Loopback access only' }));
      return;
    }

    const headers = { ...clientReq.headers };
    headers['x-forwarded-proto'] = 'https';
    headers['x-forwarded-host'] = clientReq.headers.host || `localhost:${httpsPort}`;
    headers['x-forwarded-for'] = remoteAddress;

    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: targetPort,
        path: clientReq.url,
        method: clientReq.method,
        headers,
      },
      (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(clientRes);
      }
    );

    proxyReq.on('error', (err) => {
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'application/json' });
        clientRes.end(
          JSON.stringify({
            error: 'Social Command Center backend unreachable',
            detail: err.message,
          })
        );
      }
    });

    clientReq.pipe(proxyReq);
  });

  return {
    server,
    start: () =>
      new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(httpsPort, '127.0.0.1', () => {
          server.removeListener('error', reject);
          const actualPort = (server.address() as any)?.port || httpsPort;
          console.log(
            `[Loopback HTTPS Proxy] Listening on https://127.0.0.1:${actualPort} and https://localhost:${actualPort}`
          );
          console.log(`[Loopback HTTPS Proxy] Forwarding to http://127.0.0.1:${targetPort}`);
          resolve();
        });
      }),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

// Standalone execution support
if (process.argv[1] && process.argv[1].endsWith('loopback-proxy.ts')) {
  try {
    const proxy = createLoopbackProxy();
    proxy.start();

    process.on('SIGINT', async () => {
      console.log('\n[Loopback HTTPS Proxy] Shutting down...');
      await proxy.stop();
      process.exit(0);
    });
  } catch (err: any) {
    console.error('[Loopback HTTPS Proxy Error]:', err.message);
    process.exit(1);
  }
}
