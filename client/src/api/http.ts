import { invalidateResources, resourcesForCommand } from './resource-events';

export class ApiError extends Error {
  readonly nativeUrl?: string;
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown> = {}, readonly uncertain = false) {
    super(message); this.name = 'ApiError';
    this.nativeUrl = typeof body.nativeUrl === 'string' ? body.nativeUrl : undefined;
  }
}

const requests = new WeakMap<Response, { url: string; method: string; release: () => void }>();

/** Bounded transport. No automatic retries, especially after uncertain commands. */
export async function httpFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), 90_000);
  const abort = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener('abort', abort, { once: true });
  if (init.signal?.aborted) abort();
  const release = () => { clearTimeout(timeout); init.signal?.removeEventListener('abort', abort); };
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    requests.set(response, { url, method, release });
    return response;
  } catch (error) {
    release();
    if (init.signal?.aborted) throw error;
    const command = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    throw new ApiError(command
      ? 'The command result could not be confirmed. Check its saved status before trying again.'
      : controller.signal.aborted ? 'The request timed out. Retry the read when the service is available.' : 'The service could not be reached. Retry the read when it is available.',
    0, {}, command);
  }
}

export async function checked<T = any>(response: Response): Promise<T> {
  let body: any;
  try { body = await response.json(); }
  catch { throw new ApiError('The service returned an unreadable response. Check the saved status before repeating a command.', response.status, {}, Boolean(requests.get(response) && !['GET', 'HEAD', 'OPTIONS'].includes(requests.get(response)!.method))); }
  finally { requests.get(response)?.release(); }
  if (!response.ok || body?.error || body?.success === false) {
    const request = requests.get(response);
    if (body?.partial && request) invalidateResources(resourcesForCommand(request.url));
    throw new ApiError(body?.error || body?.message || 'Request failed', response.status, body && typeof body === 'object' ? body : {});
  }
  const request = requests.get(response);
  if (request && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) invalidateResources(resourcesForCommand(request.url));
  return body as T;
}

export async function request<T = any>(url: string, init?: RequestInit): Promise<T> {
  return checked<T>(await httpFetch(url, init));
}
