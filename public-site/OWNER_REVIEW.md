# Owner review — 20 October 2026 (Asia/Bangkok)

> Historical owner-review checklist dated 20 October 2026. The owner subsequently deployed the existing Worker and completed Sandbox OAuth. See [README.md](README.md) for current local-only finalization boundaries. Legal/controller/retention gaps remain open; earlier no-publication/no-callback statements are historical.

Local preview: **http://127.0.0.1:4177/**. Use the visible Privacy Policy, Terms of Service and Support & Data Deletion links; no login or menu expansion is needed. The pages are complete drafts, not effective legal documents or legal advice.

## Proposed public content

| Route | Proposed content |
| --- | --- |
| `/` | Product purpose, self-hosted workflow, account/category/archive management, immutable originals and separate branded variants, capability-honest publishing, metrics provenance, dated Facebook/TikTok status, contact and visible policies |
| `/privacy` | Operator/scope, identity and OAuth data, media and comments/metrics, purposes, AES-256-GCM token protection versus unencrypted ordinary files, local access limits, platforms, Cloudflare request information, support email, retention limits, revocation and deletion requests |
| `/terms` | Purpose and current availability, owned/authorized accounts, content rights, AI disclosure responsibilities, third-party rules, uncertain publishing/retry limits, acceptable use, availability limits, ending use and contact |
| `/support` | Confirmed email, minimal request details, local Disconnect, platform revocation, archive versus deletion, operator-assisted local cleanup and separate platform-content deletion |

The complete proposed terms and privacy text is rendered in the preview, and maintained in `scripts/content.mjs`. It deliberately avoids a made-up company, address, retention duration, response SLA, jurisdiction or approval claim.

**Confirmed by owner:** public operator description **Independent developer based in Thailand**; support and data-deletion contact `mamduh2542@gmail.com`; the operator personally checks support emails; scheduled Facebook Reel publishing passed live verification on 20 October 2026; no manual or external application backups have been created; migration to another PC is planned but has not occurred.

**Verified from source:** no automatic backup mechanism was found in the application's database/startup code or supplied scripts. The pipeline copy operation imports media into the working store. SQLite WAL files, render variants and metric snapshots are not recovery backups. No cloud/off-site backup or backup-retention setup is claimed. See [PDPA_REVIEW.md](PDPA_REVIEW.md) for audit scope and the privacy review.

## Details that still require owner confirmation

1. **Controller disclosures:** the public description **Independent developer based in Thailand** is confirmed. Supply actual controller identity/address information needed for the applicable notice. A description and email alone do not complete that disclosure. No registered business, physical address or appointed DPO has been invented.
2. **Retention and deletion:** decide category-specific retention periods or appropriate expected retention criteria for histories, aliases, media, comments, snapshots, logs and correspondence; who can access them; and a verified selective/full-instance deletion process. Current code has no complete self-service erasure or general retention expiry. Archive is not deletion. Applicable statutory duties/time limits are not waived by a missing support SLA.
3. **Future backups and migration:** current manual/external backups are absent per the owner and no app automatic backup mechanism was found. Decide whether to introduce backups later, with location, access, retention, recovery and deletion-of-copies arrangements. No Google Drive/cloud/off-site or automatic retention setup exists in this description. A future PC migration needs a separate storage/transfer review before it happens; it is not a current practice.
4. **Support and PDPA processing details:** the operator personally checks the Gmail mailbox. No fixed correspondence-retention period or Gmail automatic-deletion rule has been confirmed; personal review does not establish either. Document retention/expected periods, mailbox access, proportionate requester/representative verification and deletion handling, including applicable legal requirements. Confirm lawful bases by purpose, any mandatory fields, indirect collection notice arrangements, provider roles and any applicable overseas-transfer requirements. Email, hosting and platform processing must be assessed separately from local app storage. See the targeted [PDPA review](PDPA_REVIEW.md); it does not certify compliance.
5. **Legal review and effective date:** confirm final policies for the actual operation. **The effective date stays pending until actual deployment approval.** This task does not choose governing law, broad liability waivers or compliance guarantees for the owner.
6. **Final hosting/content approval:** approve Cloudflare Pages Free Direct Upload and the exact pages, contact address, brand mark and status claims to be published. Recheck Cloudflare account eligibility and current pricing at deployment; no paid service is authorized. Live Cloudflare navigation/HTTPS verification remains pending; checking relative routes locally does not create a deployment.

## What would become public after approval

Only the built informational HTML, CSS, favicon, static response headers, crawl directives, any later approved TikTok signature file, and the approved email address. Anyone could read or copy the published pages; policy text and contact email could be indexed once crawl exclusions are removed. Cloudflare receives website requests. Contact is via email, not a website form.

The private repository, source scripts, application dashboard, endpoints, OAuth tokens, connected identities, videos, comments, metrics and SQLite storage are not deployment inputs. The informational site grants no management access. No OAuth callback or forwarding component is part of this deployment.

## Review decisions

- [ ] Design and factual content approved.
- [x] Public operator description and contact email confirmed.
- [ ] Required controller identity/address disclosures supplied.
- [ ] Retention, backup and deletion practices agreed and reflected accurately.
- [ ] Revised documents approved; effective date set only with actual deployment approval.
- [ ] Cloudflare Pages Free Direct Upload approved.
- [ ] Public exposure of the approved content and email approved.

**Current state: awaiting owner review. No public deployment is authorized yet.**

**Deployment preparation:** the production static candidate can be built and packaged with `npm --prefix public-site run package:upload`. The nine-file archive and verification manifest stay in ignored `.release/`. These files do not authorize publication or remove legal-review markers. See [DEPLOYMENT.md](DEPLOYMENT.md) for exact steps and the release boundary.
