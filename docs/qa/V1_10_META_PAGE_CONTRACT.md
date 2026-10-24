# V1.10 Meta Page contract research and fixture verification

Reviewed 24 October 2026 (Asia/Bangkok). This is engineering evidence, not live publication acceptance. No live social uploads or publications were performed.

The configured `META_GRAPH_VERSION` was inspected without printing other environment values: `v26.0`. Existing Reel publishing and its three-phase upload path remain unchanged.

## Primary sources

Meta's developer documentation was requested at [Page posts](https://developers.facebook.com/docs/pages-api/posts/), [Page feed](https://developers.facebook.com/docs/graph-api/reference/page/feed/), [Page photos](https://developers.facebook.com/docs/graph-api/reference/page/photos/), and [permissions](https://developers.facebook.com/docs/permissions/). The documentation host returned HTTP 429 or an inaccessible result in this environment. Direct documentation verification remains a rollout review item.

The fallback research used Meta's own current generated Business SDK source, without installing that SDK:

- [API configuration](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/apiconfig.py) declares Graph `v26.0` and SDK `v26.0.2`.
- [Page model](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/page.py), `create_feed`, declares POST `/{page-id}/feed` with `message`, `link`, `attached_media`, `multi_share_optimized`, and `published` parameters. `create_photo` declares POST `/{page-id}/photos`, `alt_text_custom`, and `published`.
- [Post model](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/post.py) exposes `id`, `from`, `is_published`, and `permalink_url` for read-back verification.
- [Photo model](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/photo.py) exposes photo identity, owner, and custom alternative text.

These primary SDK contracts support the endpoint/field implementation. They do not prove app review, Page permissions, account-specific availability, or public publication. Existing required `pages_manage_posts` plus `pages_read_engagement` gating is retained; no new grant or OAuth flow is assumed. Review current documentation and actual owner-granted permissions before a deliberately authorized live acceptance.

## Implemented behavior

- Text and links use the Page feed operation with Unicode preserved.
- A single image and ordered image batches upload validated local JPEG/PNG bytes as unpublished photos, persist each returned photo ID, then submit one feed operation with ordered `attached_media`. Optional owner-supplied alternative text is sent as `alt_text_custom`. The application supports at most ten images per batch as its own conservative limit; this is not a claim of Meta's universal limit.
- Uploaded originals are read without modification. No URL-based image fetch, crop, watermark, FFmpeg call, or public media hosting is introduced by this connector.
- The final feed request includes `multi_share_optimized=false`. The submitted array order is verified in fixtures; final native rendering/order still requires live owner review.
- Every network mutation requires a durable intent callback first. Each photo ID and final post ID must persist before another network operation begins.
- Saved photo IDs are checked against the exact Page before reuse. A saved post ID takes a GET-only reconciliation path. Timeout, incomplete response, failed verification, or unsafe permalink yields no Published result and no connector fallback/replay.
- Published success requires read-back of the exact post and Page identity, `is_published=true`, and an HTTPS Facebook permalink. An upload response alone is insufficient.
- Groups and personal profiles are rejected by this Page-specific publisher. The normal queue owns scheduling and invokes this operation only when a job is due; this operation does not create a separate remote schedule.

## Local test results

`test/meta_general_posts.test.ts`: **12 passed, 0 failed, 0 skipped**. Covers text without media, links, single-image alt text, ordered multi-image persistence, saved-photo reuse, GET-only post reconciliation, unknown feed/photo outcomes, publication verification, exact Page identity/permalink validation, preflight rejection, and durable tracking failure before submission.

`test/meta_reels_publishing.test.ts`: **5 passed, 0 failed, 0 skipped**. Existing Reel capability, three-phase upload, permission rejection, uncertainty/no-fallback, and read-only polling behavior remained green.

All fetch calls in these suites were mocked. Local fixtures were isolated. Sandbox execution encountered an ancestor-path `EPERM` before test loading; the same local-only test commands completed through approved sandbox escalation. This execution workaround did not authorize or perform live provider access.
