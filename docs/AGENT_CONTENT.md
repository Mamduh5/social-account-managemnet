# Flexible agent content preparation

The existing agent sidecar and runner can prepare image, text and Group posts, audience research, existing-video captions and Gemini story plans. This uses SCC's Content Assistant voice/rules, operator media context, saved analytics, Groups Planning and Publishing drafts. It adds no generation worker or publishing service. No production configuration, trigger or social content is changed by installation.

## Choose work

Run from the SCC repository, with the same `--state` for cooperating agents. Use an isolated SCC URL/state for testing. `content-context --account ID` reads a compact Page brief, at most five images/five videos, saved performance and at most twenty stored Groups. The snapshot is cached for fifteen minutes. `--input` containing `{"refresh":true}` explicitly refreshes it. Optional analytics/Groups failures are marked unavailable and do not block text preparation. The current operator endpoint still returns its full underlying library; this adapter bounds its projection rather than changing that API.

Save a request JSON file:

```json
{"topic":"A useful Thai explanation of a small everyday observation","brief":"Use the supplied Page voice. Clearly distinguish facts from fiction.","formats":["existing_video","image","text","group","research","gemini_video"],"maxTasks":1}
```

```powershell
npm --silent run agent -- content-enqueue --account PAGE_ID --input request.json --state .data/agent/agent.db
npm --silent run agent -- work-next --state .data/agent/agent.db
npm --silent run agent -- handoff --state .data/agent/agent.db
```

The format order expresses preference. Selection checks real resources, Page context, Group restrictions and fresh supplied research. A saved Gemini reservation or pending/recovery observation moves Gemini planning behind independent formats; no provider request is made. Images/videos with no available resource, Groups with incomplete or restricted participation, research with no fresh sources, and payloads over the context allowance are skipped. Text and story preparation remain independent of Gemini. Voice examples/facts are bounded excerpts; full prohibitions are retained. Oversized restrictions are never silently trimmed to fit. This is resource selection, not a predicted performance ranking; the agent receives actual observations and their limitations to make the creative choice.

At most three tasks are created per request, atomically within the existing backlog cap. Normalized topic + account + format + optional Group identity gives stable deduplication. Repeating a request reuses ready work, skips prepared/blocked/done work and can choose the next requested format. A changed brief for the same task requires deliberate review. There is no idle task factory, repeating research loop or unlimited backlog. Use `groupId` to select another exact stored Group; this does not create a mass-posting campaign.

| Format | Queue kind | Result |
| --- | --- | --- |
| `existing_video` | `prepare_video` | Caption/preparation using existing metadata and supplied review; no invented visual/audio acceptance |
| `image` | `image_post` | Caption, explanation and alt text for an existing image; visual claims require supplied inspection evidence |
| `text` | `text_post` | Educational or entertaining text grounded in the Page brief |
| `group` | `group_post` | Relevant post and rules-compliance explanation for one exact Group |
| `research` | `audience_research` | Analysis of fresh supplied sources, dates, uncertainty and sample limitations |
| `gemini_video` | `story_plan` | Prepared story plan only; existing `start --allow-generation` remains a separate authorized operation |

Independent image creation still requires a separately available, authorized image capability. `opening_image` and actual audiovisual `review_video` retain their existing executor restrictions. Flow remains owner-operated.

## Save prepared work through SCC

Manual agents use the existing exact `work-claim` / `work-save` revision/token protocol. Runner executors still return `agent-result.v1`. For content tasks, the `result` string should contain JSON with `title`, `text`, optional `hashtags`, and the supplied `imageId`/`altText` or `videoId` when appropriate. Never include destination overrides, approval, schedule, tools or commands.

```powershell
npm --silent run agent -- content-persist --task SAVED_TASK_ID --state .data/agent/agent.db
npm --silent run agent -- content-status --task SAVED_TASK_ID --state .data/agent/agent.db
npm --silent run agent -- work-show --task SAVED_TASK_ID --state .data/agent/agent.db
```

Text/image/Reel results go to the existing `/api/publishing/drafts` service, always unapproved, unqueued and unscheduled. Existing image integrity and video identity validation remain authoritative. The Page context fingerprint is checked again before the write. A story/research result remains in the durable work backlog with an explicitly unverified knowledge note; it never submits a new video or promotes model prose to verified research.

For automatic saving after a runner result, set **`saveContentDrafts:true`** in the existing runner configuration. Its default is **false**, and changing an enabled runner's capabilities requires the normal owner authorization. Existing executor configurations with explicit `kinds` must add the desired new kinds. No runner is enabled or schedule installed by these commands. CLI content API calls each have a ten-second timeout; existing process deadlines, invocation/token admission, claims and scheduled-host bounds still apply.

The deterministic saver, rather than a model tool, performs the write. Its intent is persisted before HTTP. Concurrent agents cannot save it twice. A crash or lost response leaves `pending`/`uncertain`; no automatic retry occurs. A save failure retains the model result and exposes `preparationError` through `runner-show`/`runner-status`; the scheduled host reports failure. Another tick cannot repeat the finished model task.

After inspecting SCC for the original resource ID, save `{"id":"KNOWN_ORIGINAL_ID"}` and run `content-reconcile --task ID --input known.json`. This performs read-back only and requires the exact original content/account/media/revision, with no approval or schedule. Changed task results cannot attach an older receipt. Handoffs contain compact resource IDs; `work-show` retrieves full content and provenance.

## Group-specific work

`groups` reads stored Group context; `groups --input` with `{"id":"GROUP_ID"}` reads that exact Group. These are owner-entered records, not discovery of Facebook membership or independently verified rules. `group-package --input` with a prepared ID reads its existing manual handoff.

Preparation requires known rules/review dates, an active plan, recorded Member/Admin status, allowed Page identity and nonrestricted participation. Personal identities remain manual and distinct from their optional source Page. A Group result must include `groupRevision`, the supplied `rulesHash`, specific `relevance` and a `compliance` explanation. Rules/eligibility are re-read before saving; native Groups revision validation also applies. Known participation restrictions and drift block writes. Natural-language compliance is an agent assertion for owner review, not a machine proof that arbitrary rules were satisfied.

The existing Group preparation endpoint captures rules, identity and relevance. No membership changes, reminders, receipts, native-site opening, Groups publishing API or automated posting are added.

## Compact research with provenance

Use supported agent search/browser tools or existing SCC observations to collect evidence, then `research-save --input finding.json --account ID`. The output-only scheduled executors retain disabled tools: they analyze supplied sources, and do not independently browse current trends. No hidden model/search provider, scraper or paid fallback is configured.

```json
{"topic":"Everyday learning","summary":"A compact finding grounded in the linked source; no popularity claim.","observedAt":"2026-11-03T04:00:00Z","validUntil":"2026-11-04T04:00:00Z","sources":[{"url":"https://example.com/source","title":"Source title","accessedAt":"2026-11-03T04:00:00Z"}],"uncertainty":"One source; no measured audience-performance evidence."}
```

`research-status --input` with `{"topic":"Everyday learning"}` and the same account returns at most five findings, stale labels and whether new evidence is needed, with zero HTTP. Records require dates, source URLs and uncertainty; freshness cannot exceed seven days. Exact duplicates reuse their immutable knowledge ID. Rechecking unchanged evidence with new timestamps does not renew its freshness. Account-scoped findings do not leak into unrelated or unassigned tasks. Source claims remain agent-supplied and not independently verified by the application; use actual SCC analytics provenance and do not convert unavailable metrics into zeros or a small sample into a trend.

Implementation evidence and recovery limitations: [validation report](qa/FLEXIBLE_CONTENT_PRODUCTION.md).

Independent live research and compact typed results are now explicit opt-in capabilities. See [neutral research operations](AGENT_RESEARCH_OPERATIONS.md) for capability preflight, schemas, composite prepare/receipt operations and measured live limits. Existing supplied-evidence tasks retain their legacy contract and default tool restrictions.
