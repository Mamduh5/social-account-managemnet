# Autonomous Rai/Developer Reels: technical-only publication policy - 9 November 2026

Owner direction for this assignment explicitly authorizes prospective autonomous publication of valid generated Reels, accepting imperfect creative quality. This supersedes the machine-review requirement only for ร้อยละคนไทย (Graph `1313185685220741`) and แก้บัคยาวๆๆ (Graph `409347032254077`). โลกจริงหลุดบท retains its existing owner-review policy and generation control. Flow, text/image automation and Groups are unchanged.

## Policy and audit contract

The additive `reel-technical-policy.v1` authorization has mode `owner_authorized_no_creative_review`. It binds the existing immutable generation/publication grants, Page identities, target origins and editorial profile. It does not replace grants or reset their dispatches. The existing grant's historical `reviewMode: machine_with_owner_override` remains immutable; API status exposes `effectiveReviewMode` and the overlay receipt separately.

Authorization records a server-time cutoff and all existing item identities. Previously completed/imported candidates, machine-review candidates, archived failures, owner decisions and failed items are excluded. Only exact pending unreviewed originals are explicitly enrolled, preserving project/input identity. New items after the cutoff qualify prospectively. Existing archived failures cannot be restored, reviewed or published through this policy.

Existing AgentRunner callbacks perform source-aware original import, technical analysis, existing moving-watermark render and exact-Page Reel draft preparation. `qualifyTechnicalPolicy` checks full media decode, master/variant hashes and unchanged decoded audio, original completion and import receipt, exact Page branding, current source evidence, editorial identity, public copy and revision. It records `policyEligibility`, with `creativeReviewed:false`, `ownerReviewed:false`, `listeningPerformed:false`. It creates no creative `qa`, machine acceptance, model review task or claimed audiovisual PASS. Quiet/silent audio and imperfect generated text are not creative rejection criteria; media corruption and missing contract-required audio still hold.

The existing publication service consumes this separately typed eligibility, records its authorization source on the exact-revision approval intent and queue intent, then uses the existing draft approval/queue APIs and Meta worker. The draft's generic approved state means the exact revision is eligible under the recorded policy; it does not claim per-video owner review. Media/copy/policy changes and explicit owner rejection or changes still hold. A voluntary actual owner approval can use Video Review's existing watched/listened/factual attestation and retains its distinct provenance. Optional preview remains available.

Publication cadence is unchanged: maximum two Reels per rolling 24 hours, six-hour minimum, twelve-hour preferred spacing. Generation remains independently eligible under its existing rolling dispatch allowance, shared sequential provider reservation, backlog/storage limits and native admission. Neither elapsed time nor a Page allowance proves Google capacity. No counter, consumed supplement, failed dispatch or quota is reset/refunded.

Google security checks remain manual. The protected exact original is observed through existing callbacks; a completed artifact can import and continue without another owner instruction. Only after verified original completion may its local human/reconciliation hold clear; all native admission/security checks still govern future submissions. Retry/Regenerate and CAPTCHA automation are not introduced.

## Validation

The isolated tests exercise both Page workflows through completed artifact, import, moving watermark, draft, policy eligibility, exact-revision queue and simulated official-API confirmation/permalink. They prove the executable path without a creative reviewer or owner approval; simulated Meta receipts are not live publication evidence. Coverage also includes pending-original recovery after a security hold, historical exclusion, archived immutability, source expiry, media/revision drift, owner rejection, paused grants, atomic audit writes, optional real owner review, existing backlog callback and generation ahead of twelve-hour publication pacing.

Focused final gate, full isolated gate, type checks, client build and actual activation evidence are recorded below after completion. Private logs and before/after receipts remain under ignored `.data/`; no credentials or authenticated browser captures are included.

## Operational evidence

Initial owner pin: `822168747bc546170b8f0db8d802258aa8d81fab`. SCC remains available on loopback 3001/3443. Initial Pipeline read-only admission failed `transport_failed`; no listener was present on 8080. Saved Developer project `ccc60f4a-de26-4c85-b60f-c8fcc76b4e84` remains protected on a local human/reconciliation hold; saved state alone does not establish current Google UI status or a completed result. Its one-use generation supplement remains consumed.

Each scoped Page initially had two normal rolling application dispatch slots remaining, three lifetime charged dispatches, and zero confirmed Reels in the current publication window. Numeric Google provider allowance is unknown. A saved `video_available` observation from 7 November is historical, not fresh readiness. The previous unknown-usage concept-executor receipt remains retained; no model or quota accounting is repaired by this policy.

No historical Rai or Developer candidate is silently queued for publication. Real new publications, if any, require the existing Meta API confirmation with remote ID and permalink.
