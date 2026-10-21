# Hosting and TikTok developer notes

> Historical Pages/Sandbox research dated 20 October 2026. The existing service now uses Cloudflare Workers Static Assets and a callback redirect relay; see [README.md](README.md) and [DEPLOYMENT.md](DEPLOYMENT.md). Earlier no-public-URL/no-relay statements are superseded. Policy eligibility remains separate.

Researched **20 October 2026, Asia/Bangkok** from the official sources below. No Cloudflare or TikTok accounts/settings were changed. These notes are private project documentation, not part of the public output.

## Cloudflare Pages Free

Use a separate **Direct Upload** static Pages project and its assigned HTTPS `pages.dev` hostname. An owner-controlled Cloudflare account is required. No purchased domain or public Git repository is needed. Upload prebuilt files with the dashboard; Wrangler is an alternative. Direct Upload cannot later be switched to Git integration without creating another project. See [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

The documented Free limits include 500 builds per month, one concurrent build, 20,000 files per site and 25 MiB per file. Dashboard drag-and-drop has a lower 1,000-file upload limit. This site has nine generated files and is far below those limits. Functions would use Workers quotas; none are included. No paid feature is needed for this static scope. Verify the account's plan and current terms at deployment; an account signup or an agreement is for the owner to complete. See [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) and [Direct Upload limits](https://developers.cloudflare.com/pages/get-started/direct-upload/#limits).

Cloudflare now recommends Workers for new applications, while Pages still documents static Direct Upload. The owner requested Pages; this project needs no application runtime. See [Pages overview](https://developers.cloudflare.com/pages/).

`privacy.html`, `terms.html` and `support.html` are served at extensionless paths. A top-level `404.html` disables Pages' default SPA fallback. `_headers` supplies a strict policy blocking browser scripts, API connections, forms and framing. See [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/) and [Custom headers](https://developers.cloudflare.com/pages/configuration/headers/). Verify actual HTTPS behavior after deployment; the local preview is not Cloudflare acceptance. Cloudflare handles delivery/security request information under its [Privacy Policy](https://www.cloudflare.com/privacypolicy/).

## TikTok Web + Login Kit + Display API + Sandbox

The intended configuration remains **Web**, **Login Kit**, **Display API**, initially **Sandbox**, preserving the existing Personal account. No Content Posting API product or Business-account conversion is required for this website task.

Sandbox supports restricted integration testing without production app review and supports designated target users; the owner must authorize the appropriate account. The app-registration guide says Sandbox URL verification is required only for Content Posting API. Recheck the actual Portal prompts because TikTok's newer development-configuration guide describes verification more generally. Do not add an unnecessary posting product just to trigger verification. Sources: [Sandbox](https://developers.tiktok.com/docs/en/add-a-sandbox), [Register your app](https://developers.tiktok.com/docs/en/getting-started-create-an-app), [Development configuration](https://developers.tiktok.com/docs/en/set-up-development-configuration).

For production review, TikTok requires an externally facing, developed website with active Privacy and Terms links visible without opening a menu, accurate product/scope explanations and an end-to-end demonstration. Its guidelines explicitly exclude private/personal-use apps and apps still in development/testing. A separate informational website does not make this private tool eligible, demonstrate a working integration, or solve the requirement for a Web demonstration matching the registered website domain. Preserve honest self-hosted/development language; remain with Sandbox until eligibility and the actual integration are resolved. Source: [App Review Guidelines](https://developers.tiktok.com/docs/en/app-review-guidelines).

## URL ownership: likely feasible by prefix, not verified

For relevant production app configurations created after 9 September 2024, the registration guide requires verification of website, Privacy and Terms URLs. It provides Domain and URL-prefix methods; the latter uses a downloaded signature file hosted at the required URL. Source: [Verify URL ownership](https://developers.tiktok.com/docs/en/getting-started-create-an-app#verify-url-ownership).

**Inference from those documents:** a project-specific `https://<assigned>.pages.dev/` URL prefix should be technically suitable for file verification because the owner can deploy a file at its required path. The owner does not control DNS for the parent `pages.dev` domain; do not attempt domain/DNS verification for it. Use the project prefix and verify coverage for all configured paths according to the Portal's actual instructions. TikTok acceptance of the assigned domain is **unverified**, and no real signature file or hostname has been provided.

After website approval and deployment:

1. Enter the real assigned HTTPS website, Privacy and Terms URLs in the intended environment; inspect its actual verification requirements.
2. If requested, download TikTok's exact signature file and preserve the filename/content. Inspect it for scope before adding it to the static output allowlist. Do not include developer secrets.
3. Redeploy the reviewed site plus the signature file only. Confirm unauthenticated HTTPS GET returns the exact file, not a 404 page, home page, redirect or login challenge.
4. Complete Portal verification and record its actual result. Never claim verification based only on successful hosting. Keep the required file in subsequent deploys while TikTok needs it.

Do not fabricate signature files, Portal screenshots, working public URLs or an approval result.

## OAuth is separate future work

The static informational website cannot exchange codes, protect secrets, refresh tokens or bind a local OAuth session. TikTok Web Login requires an exact pre-registered absolute HTTPS redirect URI, without query parameters or fragments. Its guide requires server-side token handling and state protection. Source: [Login Kit for Web](https://developers.tiktok.com/docs/en/login-kit-web).

A future forwarding design may expose **only** `/api/connections/callback/tiktok` at a separately reviewed HTTPS endpoint. Do not point a general tunnel or wildcard proxy at the management server. No forwarding process, callback function or public listener is created by this task. All other paths and methods must fail closed. Review permitted callback method/query handling, TLS, no secret/code/state logging, narrow forwarding, rate limiting, session expiry and replay protection before authorization.

The existing app binds the callback to an initiating local browser cookie/account/revision and performs a compare-and-set exchange. A remote callback origin cannot simply be assumed to receive the local binding cookie. The future design must prove a secure one-time handoff or equivalent that preserves those protections; do not relax origin/state/identity checks to make it work. Securely deliver only the callback response back to the correct local session, keep secrets server-side and perform an end-to-end Sandbox test. No automatic live OAuth or publication is authorized by building this website.

## Support procedures

Local Disconnect is backed by `account-connections.repo.ts:disconnect`: credentials and connection metadata are cleared, sessions invalidated. Archival preserves history; no full erasure route exists. Policies describe that limit. TikTok's own [connected-app instructions](https://support.tiktok.com/en/safety-hc/account-and-user-safety/connect-to-third-party-apps) describe removing access through Apps and services permissions. The search index returned the official text; direct automated fetching was blocked by robots. Meta's Business Integrations link is an authenticated settings destination, not a promise of a stable menu label. No platform authorization was removed or changed.
