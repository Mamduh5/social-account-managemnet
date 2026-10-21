# V1.9 nullable account statistics maintenance

The V1.9 correction distinguishes explicit numeric zero from missing, null and unsupported account statistics. Basic TikTok profile fallback is not statistics confirmation. Provider errors and incomplete responses produce no account snapshot. Partially available responses retain numeric fields and store unavailable fields as SQL `NULL`; `metric_contract_version=1` identifies this contract. Post metrics and their provenance remain independent.

Existing `analytics_snapshots` columns were `NOT NULL DEFAULT 0`. Both synchronization and repository code coerced unavailable values to zero. The fixed code refuses account-snapshot writes on that old schema and reports a maintenance requirement. It can continue genuine post synchronization. New isolated databases use the nullable schema. Normal server startup does **not** rebuild or remediate an existing analytics table.

## Historical evidence and interpretation

Rows with `source IN ('tiktok_display_api', 'meta_graph_api')` and no version marker identify legacy candidates, separated by source. Before the version column exists, use:

```sql
SELECT id, account_id, observed_at, source, followers_total, likes,
       views, comments, shares, provenance_status, notes
FROM analytics_snapshots
WHERE source IN ('tiktok_display_api', 'meta_graph_api')
ORDER BY observed_at, id;
```

After migration, add `AND metric_contract_version IS NULL`. The previous TikTok account connector supplied only followers, following and likes; the Meta account connector supplied only followers. Neither supplied account views, comments, shares, follower gain, watch time or engagement rate, so their stored default zeros are unsupported. Meta account likes are also unsupported. TikTok followers/likes zeros and Meta follower zeros are ambiguous because the original response bodies and field presence were not saved. Positive supported numeric observations remain usable. Zero post metrics and browser/manual observations are a separate source and must not be invalidated.

At the 21 October 2026 10:40:47 Asia/Bangkok read-only audit, ten legacy TikTok account snapshots existed, from `2026-10-20T12:02:52.735Z` through `2026-10-21T03:32:34.780Z`. The validation also identified 49 legacy Meta account snapshots as a separate candidate cohort. The protected old backend may append more before maintenance. These are dated counts, not an assertion about the final collector output. No historical rows were rewritten. Current overview/ranking reads exclude unversioned official-API zero followers and account defaults; the UI displays `Unavailable`. The repository history projection masks unsupported legacy totals while retaining a warning. Raw rows remain available for audit.

## Read-only inspection

From the repository root, pass an explicit absolute database path. This script imports neither application startup nor `.env`, starts no workers and makes no provider requests. Its default is read-only:

```powershell
npx tsx scripts/migrate-account-metrics.ts --database 'D:\path\social_command_center.db'
```

## Apply only during later owner maintenance

Do not apply while the protected backend or collector is running. Do not stop either process for this validation task. Wait until the collector's natural observation window has finished and the owner deliberately begins backend maintenance. Validate the final observation and any natural renewal separately before changing the runtime.

The apply command requires the saved collector JSON, explicit maintenance acknowledgements, absent collector/backend process IDs, a completed observation window and a new absolute backup path. It creates a consistent SQLite backup and verifies integrity and account-snapshot count before migrating. The rebuild runs in one immediate transaction, preserves every historical value/source/note/timestamp, retains indexes/triggers and rolls back on foreign-key failure or an unrecognized schema. Applying it again is a no-op. There is no automatic historical zero-to-null update.

```powershell
npx tsx scripts/migrate-account-metrics.ts `
  --database 'D:\path\social_command_center.db' `
  --apply --backend-stopped --collector-finished `
  --observation 'D:\path\live-observation.json' `
  --backup 'D:\path\backups\before-v19-statistics.db'
```

The protected process checks are deliberately conservative: if a PID is still present, including a reused PID, the command refuses to migrate. Review that condition manually instead of bypassing the collector guard. After successful maintenance, restart the backend deliberately on the fixed code and verify real synchronization. Do not interpret fixture PASS or natural renewal on the preserved old process as proof that these fixes were exercised live.
