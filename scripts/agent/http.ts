import {createHash} from 'node:crypto';

export class ApiError extends Error {
  constructor(public readonly status: number | null, public readonly code: string, public readonly uncertain: boolean) {
    super(code);
    this.name = 'ApiError';
  }
}

export function loopbackOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Expected an HTTP loopback origin.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Expected an HTTP loopback origin without credentials, path, query, or fragment.');
  }
  return url.origin;
}

type Fetch = typeof globalThis.fetch;
export class JsonClient {
  requestCount=0;
  public readonly origin: string;
  private readonly fetcher: Fetch;
  private readonly timeoutMs: number;

  constructor(origin: string, options: { fetch?: Fetch; timeoutMs?: number } = {}) {
    this.origin = loopbackOrigin(origin);
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 300_000) throw new Error('Invalid HTTP timeout.');
  }

  get<T = unknown>(resource: string): Promise<T> { return this.request<T>('GET', resource); }
  post<T = unknown>(resource: string, body: unknown, options: { idempotencyKey?: string } = {}): Promise<T> { return this.request<T>('POST', resource, body, options.idempotencyKey); }

  /** Bounded read-only artifact verification; never writes or transforms media. */
  async media(resource:string,maxBytes:number):Promise<{sha256:string;bytes:number}> {
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1024**3)throw new Error('Invalid media byte bound');
    const url=new URL(resource,this.origin);
    if(!resource.startsWith('/')||resource.startsWith('//')||resource.includes('\\')||url.origin!==this.origin||url.search||url.hash||url.username||url.password)throw new Error('Invalid media resource');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try {
      this.requestCount++;
      const r=await this.fetcher(url,{method:'GET',signal:controller.signal,redirect:'error'});
      if(!r.ok||!r.body)throw new ApiError(r.status,'media_unavailable',false);
      const length=Number(r.headers.get('content-length'));
      if(length>maxBytes)throw new ApiError(r.status,'media_byte_limit',false);
      const hash=createHash('sha256'),reader=r.body.getReader();let bytes=0;
      try {for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>maxBytes)throw new ApiError(r.status,'media_byte_limit',false);hash.update(part.value);}}
      finally{await reader.cancel().catch(()=>{});}
      if(!bytes)throw new ApiError(r.status,'empty_media',false);
      return {sha256:hash.digest('hex'),bytes};
    }catch(e){if(e instanceof ApiError)throw e;throw new ApiError(null,'media_read_failed',false);}
    finally{controller.abort();clearTimeout(timer);}
  }

  private async request<T>(method: 'GET' | 'POST', resource: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    if (!resource.startsWith('/') || resource.startsWith('//') || resource.includes('\\')) throw new Error('Expected an absolute API path.');
    const target = new URL(resource, this.origin);
    if (target.origin !== this.origin || target.hash || target.username || target.password) throw new Error('Invalid API path.');
    const headers: Record<string, string> = { accept: 'application/json' };
    if (method === 'POST') headers['content-type'] = 'application/json';
    if (idempotencyKey) {
      if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(idempotencyKey)) throw new Error('Invalid idempotency key.');
      headers['idempotency-key'] = idempotencyKey;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      this.requestCount++;
      const result = await this.fetcher(target, { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined, signal: controller.signal, redirect: 'error' });
      if (!result.ok) {
        // Do not echo provider responses: they can contain tokens or raw account details.
        throw new ApiError(result.status, 'http_' + result.status, method === 'POST' && (result.status >= 500 || [408, 425].includes(result.status)));
      }
      try { return await result.json() as T; }
      catch { throw new ApiError(result.status, 'invalid_json_response', method === 'POST'); }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(null, controller.signal.aborted ? 'request_timeout' : 'transport_failed', method === 'POST');
    } finally { clearTimeout(timer); }
  }
}
