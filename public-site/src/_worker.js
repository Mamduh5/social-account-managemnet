/**
 * Cloudflare Worker for Social Command Center (billowing-leaf-7ccd)
 *
 * 1. Narrowly intercepts GET /api/connections/callback/tiktok to bounce the browser
 *    to the local HTTPS Command Center at https://localhost:3443/api/connections/callback/tiktok.
 * 2. Strictly forwards only allowlisted OAuth query parameters.
 * 3. Never proxies local APIs, never stores secrets, and never permits open redirects.
 * 4. Falls back to static assets (env.ASSETS) for all other routes.
 */

const LOCAL_CALLBACK_ORIGIN = 'https://localhost:3443';
const CALLBACK_PATH = '/api/connections/callback/tiktok';
const ALLOWED_PARAMS = ['code', 'state', 'error', 'error_description', 'error_code', 'scopes'];

// Length limits accommodating valid OAuth responses (including verbose error descriptions and scopes)
const MAX_LENGTHS = {
  code: 2048,
  state: 512,
  error: 256,
  error_description: 1024,
  error_code: 128,
  scopes: 1024,
};

function hasControlChars(str) {
  // Check for control characters (ASCII 0-31 and 127)
  return /[\x00-\x1F\x7F]/.test(str);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Exact path matching for TikTok OAuth callback
    if (url.pathname === CALLBACK_PATH) {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: {
            'Allow': 'GET',
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      const params = url.searchParams;
      const code = params.get('code');
      const state = params.get('state');
      const error = params.get('error');

      // State is mandatory for CSRF binding
      if (!state) {
        return new Response('Bad Request: Missing required OAuth parameter (state)', {
          status: 400,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      // Either code or error must be present
      if (!code && !error) {
        return new Response('Bad Request: Missing required OAuth parameter (code or error)', {
          status: 400,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      // Construct hardcoded local target URL (prevents open redirects and host header injection)
      const targetUrl = new URL(CALLBACK_PATH, LOCAL_CALLBACK_ORIGIN);

      // Forward only allowlisted parameters with length and safety checks
      for (const key of ALLOWED_PARAMS) {
        const val = params.get(key);
        if (val !== null) {
          const maxLen = MAX_LENGTHS[key] || 512;
          if (val.length > maxLen || hasControlChars(val)) {
            return new Response(`Bad Request: Invalid or malformed OAuth parameter (${key})`, {
              status: 400,
              headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
              },
            });
          }
          targetUrl.searchParams.set(key, val);
        }
      }

      // Fixed-target 302 redirect with strict no-cache and privacy headers
      // Note: We deliberately do NOT log code or state values to console
      return new Response(null, {
        status: 302,
        headers: {
          'Location': targetUrl.href,
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Referrer-Policy': 'no-referrer',
          'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        },
      });
    }

    // Static assets fallback (serves index.html, /privacy, /terms, /support, 404, styles, etc.)
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  },
};
