import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';

/** Disposable TLS identity: never reads the owner's .data/certs or changes global TLS trust. */
export function createTestLoopbackTls() {
  assert.ok(process.env.SCC_DATA_DIR, 'Isolated SCC_DATA_DIR is required');
  const certDir = path.resolve(process.env.SCC_DATA_DIR, 'test-tls');
  mkdirSync(certDir, { recursive: true });
  const keyPath = path.join(certDir, 'localhost.key');
  const certPath = path.join(certDir, 'localhost.crt');
  const candidates = [
    'openssl',
    path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git', 'usr', 'bin', 'openssl.exe'),
  ];
  let generated = false;
  for (const executable of candidates) {
    if (executable !== 'openssl' && !existsSync(executable)) continue;
    const result = spawnSync(executable, [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
      '-keyout', keyPath, '-out', certPath,
    ], { stdio: 'ignore', windowsHide: true });
    if (result.status === 0) { generated = true; break; }
  }
  assert.ok(generated, 'OpenSSL is required to generate disposable loopback test certificates (Git for Windows includes it)');
  const ca = readFileSync(certPath);
  const fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.ok(url.protocol === 'https:' && ['localhost', '127.0.0.1'].includes(url.hostname), 'Only isolated HTTPS loopback requests are allowed');
    return new Promise((resolve, reject) => {
      const request = https.request(url, {
        method: init.method || 'GET',
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        ca,
        rejectUnauthorized: true,
      }, response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('error', reject);
        response.on('end', () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) for (const item of value) headers.append(name, item);
            else if (value !== undefined) headers.set(name, value);
          }
          resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers }));
        });
      });
      request.on('error', reject);
      if (init.body !== undefined && init.body !== null) {
        assert.equal(typeof init.body, 'string', 'Loopback test fetch accepts string bodies');
        request.write(init.body);
      }
      request.end();
    });
  };
  return { keyPath, certPath, fetch };
}
