# Targeted privacy and storage review — 20 October 2026

> Historical targeted review dated 20 October 2026, not a renewed legal opinion. A local database safety copy was subsequently created during 21 October maintenance, and the public Worker now redirects the narrow TikTok callback. Earlier no-backup/no-callback/no-deployment statements are superseded by [README.md](README.md). No automated or off-site backup is established by that copy.

This is an owner-review gap assessment of the informational site's drafts, not a certification of compliance, legal opinion or authorization to publish. No private-app code, configuration or data was changed.

## Thai PDPA review

Primary legal reference: the Ministry of Digital Economy and Society's [PDPA B.E. 2562 (2019), unofficial English translation](https://www.mdes.go.th/law/detail/3577-Personal-Data-Protection-Act-B-E--2562--2019-). The Thai law and applicable current implementing rules control. The [Thai SEC's privacy notice](https://www.sec.or.th/TH/Pages/PRIVACYNOTICE.aspx) was also checked as a government example of individual-rights presentation; its organization-specific practices, DPO, deadlines and legal bases were not copied.

| Review area | Targeted correction / remaining gap |
| --- | --- |
| Applicability, sections 4–5 | Treat scope as fact-dependent. A private/self-hosted app is not automatically a household exemption; public-site/support processing needs its own assessment. |
| Notice, section 23 | Purposes, required data/consequences, retention, recipients, controller identity/address/contact and rights need a completed notice. The draft now distinguishes website/support from private-app data. Identity/address, bases and retention remain unresolved. |
| Bases / indirect collection, sections 19, 24–26 | Do not equate OAuth grants with a PDPA basis. Confirm purpose-level grounds and notice arrangements for platform-derived data and any sensitive content. |
| Rights, sections 19, 30–36, 73 | Privacy section 8 now describes conditional rights and complaints; Support links to it and accepts requests from affected individuals, not only account owners. No automated portal or universal outcome is claimed. |
| Timing | No invented SLA. Applicable statutory times still govern; section 30's access rule is not a universal deadline for every request. |
| Recipients/transfers, sections 28–29 | Distinguish local storage from hosting/email/platform processing. Provider roles, destinations and any required arrangements need assessment; no unverified safeguards are claimed. |

The owner has confirmed the public operator description **Independent developer based in Thailand**. It is not a substitute for actual controller identity/address disclosures. The approved contact remains **mamduh2542@gmail.com**. The owner personally checks support emails; no correspondence-retention period or Gmail automatic-deletion rule has been confirmed. Application/site source contains no support email ingestion or retention integration. No business registration, address, DPO or deletion deadline was invented. Effective date remains pending actual deployment approval.

## Current storage and backup audit

**Owner statements:** no manual or external backups of Social Command Center have been created. Moving the application/data to another PC is planned but has not occurred. No Google Drive, cloud/off-site backup or automatic backup-retention arrangement is to be represented as configured.

**Read-only source evidence:**

- `server/src/db/database.ts`: working SQLite database, upload/render directories and WAL mode; no backup API or scheduled backup routine.
- `server/src/db/schema.ts`: schema/migration definitions and analytics tables; metric snapshots are application records, not database backups. This file was inspected, not executed.
- `server/src/index.ts`, `services/queue.service.ts` and `services/sync.service.ts`: queue and metric-sync background work; no backup job found.
- `server/src/services/pipeline.service.ts:importVideoFile`: `copyFileSync` imports selected media into the working upload store. It does not back up the complete application or database.
- Server source search for backup/VACUUM/backup APIs, file copies and cloud-copy tools found no automatic backup implementation. Other file-write sites concern avatar/media downloads or native handoff packages.
- `package.json`, `run_server.ps1`, `run_tests.ps1`, `build_client.ps1`, `Dockerfile` and `docker-compose.yml`: no supplied backup scheduler/service/script found. The container's data mount is working persistence, not an independent backup; inspecting packaging is not evidence that Docker is the active runtime.

**Conclusion:** the reviewed application does not implement automatic recovery backups. Combined with the owner's statements, the draft describes current working data on the existing PC and no configured application backup arrangement. SQLite WAL/journal files, generated variants, source media imports and analytics history are not independent recovery backups. This source audit does not assert that every OS task, third-party sync service, disk snapshot or platform-internal copy has been inventoried. Cloudflare/email/provider processing is separate from application backup configuration.

**Remaining decisions:** retention/expected retention criteria by category; mailbox correspondence retention/access; verified selective and full-instance deletion procedures; any future backup location/access/retention/recovery/deletion policy; and a separate review before a future migration changes storage practices. No migration, deletion or backup was performed.

## Relative navigation and publication boundary

All generated policy/support links already use `/privacy`, `/terms` and `/support`. No localhost link required replacement in the public output. Localhost references in private preview documentation and scripts are development instructions, not deployed site assets. The build checker now explicitly enforces same-origin relative internal links and rejects more loopback-address forms.

`privacy.html`, `terms.html` and `support.html` match Cloudflare Pages' documented extensionless routing; a root `404.html` prevents SPA fallback. Source: [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/). HTTPS Pages-shaped URL resolution and local navigation can be checked without publication. Actual Cloudflare-hosted navigation, redirects and HTTPS remain unverified until the owner authorizes deployment; no project/hostname is fabricated.
