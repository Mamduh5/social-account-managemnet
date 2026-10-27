# GEMINI.md — Persistent Creative & Technical Instructions for Gemini Agents

> **Repository:** Social Command Center  
> **Primary Creative Target:** Facebook Page **แก้บัคยาวๆๆ** (`acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5`, Graph ID `409347032254077`)  
> **Application Core:** `http://localhost:3001` (Managed Owner Runtime)  
> **Canonical Creative Playbook:** [`docs/content/PAGE_A_CREATIVE_PLAYBOOK.md`](docs/content/PAGE_A_CREATIVE_PLAYBOOK.md)  
> **Creator Benchmarks:** [`docs/content/CREATIVE_BENCHMARKS_PAGE_A.md`](docs/content/CREATIVE_BENCHMARKS_PAGE_A.md)

---

## 🚀 START HERE: Quick Onboarding for Fresh Gemini Sessions

When starting a new session in this repository, follow these core operational rules:

1. **What is Social Command Center?**  
   A self-hosted command center managing multi-account social media publishing, queue orchestration, dynamic watermark rendering, engagement sync, and cross-platform analytics for Facebook Pages and TikTok accounts.

2. **Which Page is authorized for creative experimentation?**  
   **ONLY Page A: แก้บัคยาวๆๆ** (`acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5`, Graph ID `409347032254077`). Never touch or publish to *โลกจริงหลุดบท* or TikTok accounts.

3. **Where are the creative playbook and creator benchmarks?**  
   * **Playbook:** [`docs/content/PAGE_A_CREATIVE_PLAYBOOK.md`](docs/content/PAGE_A_CREATIVE_PLAYBOOK.md) (voice, visual rules, banned antipatterns, publication APIs).
   * **Benchmarks:** [`docs/content/CREATIVE_BENCHMARKS_PAGE_A.md`](docs/content/CREATIVE_BENCHMARKS_PAGE_A.md) (empirical case studies of 9arm, BorntoDev, Extreme IT).

4. **Which content example has passed owner review and live publication?**  
   The **LINE Video Quality 3-Image Carousel** published on 27 October 2026:  
   * Remote Post ID: `409347032254077_122196999368464828`  
   * Live Permalink: [https://www.facebook.com/122196967700464828/posts/122196999368464828](https://www.facebook.com/122196967700464828/posts/122196999368464828)

5. **How to produce finished assets?**  
   * 1080 × 1350 px (4:5 vertical) PNG images.
   * Render via Playwright / Headless Edge using modern typography (`Kanit`, `Prompt`, `Inter`) on sleek dark slate surfaces.
   * Use FFmpeg for realistic video compression simulations or video watermarks.

6. **How to fact-check before publication?**  
   * Check official product documentation (LINE Help Center, Apple Developer Docs).
   * **NEVER invent numbers:** No unsupported claims (e.g. "4K always becomes 720p" or "90% loss").
   * **ALWAYS label simulations:** If visual comparison is simulated locally, label clearly: `* ภาพจำลองเพื่ออธิบายผลของการลดทอนคุณภาพ`.

7. **How to save unapproved drafts?**  
   * Upload images: `POST http://localhost:3001/api/publishing/images` (multipart field `image`).
   * Create draft: `POST http://localhost:3001/api/publishing/drafts` (JSON with `contentType: 'multi_image'`).
   * Drafts stay strictly unapproved until explicitly reviewed.

8. **When is explicit owner approval necessary?**  
   **ALWAYS.** Every single public Facebook publication requires explicit owner review and authorization. Approval of post N does NOT authorize post N+1.

9. **How to verify a real publication?**  
   * Check post and destination status via `GET http://localhost:3001/api/publishing/posts`.
   * Confirm `status: 'published'`, `confirmation_source: 'api'`, and verify `remote_post_id` and `remote_post_url`.
   * Check for errors; if uncertain, use read-only reconciliation (`POST /api/publishing/destinations/:id/reconcile`), never double-submit.

10. **Which accounts and historical jobs must NEVER be disturbed?**  
    * Do NOT touch the 3 protected historical manual destinations: `dest-mvf5hdwf-19hi`, `dest-mvf5j24q-ub0y`, `dest-mvf5j24r-rw4x`.
    * Do NOT publish to Page B: *โลกจริงหลุดบท* (Verified DB Account ID `acc-b82c9a5f-7a87-4c6a-88bd-9c8e93467978`, Handle `@61595592674364`). Note: `acc-fb-2` is the demo placeholder (*ScreenToLife Studio*).
    * Do NOT publish or touch TikTok accounts (Verified DB Account ID `acc-e0d55bef-1976-4213-92d8-4f949ee3e5f7`, Handle `@maroooooooooooon16`).
    * Do NOT run destructive operations, git push, or live cloud deploys.

---

## 🎨 Writing & Visual Standards Checklist

- [ ] **Audience:** Everyday users, tech enthusiasts, developers in Thailand.
- [ ] **Tone:** Helpful, relatable tech peer; natural Thai with English technical terms.
- [ ] **No Emojis:** Zero decorative emojis in visuals or captions.
- [ ] **No Marketing Hype:** No forced engagement bait ("กดไลก์เลย"), no dramatic promises.
- [ ] **Hashtags:** Max 2–3 relevant tags.
- [ ] **Visual Hierarchy:** Clean cards, generous padding, mobile-friendly font sizes.
