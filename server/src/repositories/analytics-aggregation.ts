import {db} from '../db/database.js';
import type {AnalyticsFilter} from './analytics.repo.js';

const fields = {views:'view_count',likes:'like_count',comments:'comment_count',shares:'share_count'} as const;
export function accountFilter(filter: AnalyticsFilter = {}, alias = 'a') {
  const conditions = [`${alias}.is_demo=0`,`${alias}.archived_at IS NULL`], values: string[] = [];
  for (const [key,column] of [['platform','platform'],['accountId','id'],['categoryId','category_id']] as const) {
    if (filter[key]) { conditions.push(`${alias}.${column}=?`); values.push(filter[key]!); }
  }
  return {sql:conditions.join(' AND '),values};
}

export function aggregateLatest(filter: AnalyticsFilter | undefined, grouping: 'all'|'platform'|'category'|'account', followerSql: string) {
  const where=accountFilter(filter);
  const metrics=Object.entries(fields);
  const perAccount=metrics.map(([key,column])=>`SUM(CASE WHEN pms.provenance_status='confirmed' THEN pms.${column} END) AS total_${key}, COUNT(CASE WHEN pms.provenance_status='confirmed' THEN pms.${column} END) AS known_${key}`).join(',');
  const selections=metrics.map(([key])=>`CASE WHEN SUM(known_${key})=SUM(destination_count) AND SUM(destination_count)>0 THEN SUM(total_${key}) ELSE NULL END AS total_${key}, SUM(known_${key}) AS known_${key}, SUM(total_${key}) AS observed_${key}`).join(',');
  const group=grouping==='platform'?'platform':grouping==='category'?'category_id':grouping==='account'?'id':null;
  const rows=db.prepare(`
    WITH Latest AS (
      SELECT pms.*,ROW_NUMBER() OVER(PARTITION BY destination_id ORDER BY julianday(observed_at) DESC,rowid DESC) rn FROM post_metrics_snapshots pms
    ), PerAccount AS (
      SELECT a.id,a.name,a.handle,a.platform,a.avatar_url,a.last_synced_at,c.id category_id,c.name category_name,c.color category_color,c.slug,
        ${followerSql} AS followers,COUNT(pd.id) destination_count,COUNT(pms.id) synced_count,${perAccount}
      FROM accounts a LEFT JOIN categories c ON c.id=a.category_id
      LEFT JOIN publishing_destinations pd ON pd.account_id=a.id AND pd.status='published'
      LEFT JOIN Latest pms ON pms.destination_id=pd.id AND pms.rn=1
      WHERE ${where.sql} ${grouping==='category'?'AND c.id IS NOT NULL':''} GROUP BY a.id
    )
    SELECT ${group ? group + ',' : ''} ${grouping==='account'?'name,handle,avatar_url,category_name,category_color,platform,':''}
      ${grouping==='category'?'category_name AS name,category_color AS color,slug,':''}
      COUNT(id) account_count,SUM(destination_count) destination_count,SUM(synced_count) total_synced_videos,MAX(last_synced_at) last_sync_time,
      CASE WHEN COUNT(followers)=COUNT(id) AND COUNT(id)>0 THEN SUM(followers) ELSE NULL END total_followers,
      ${selections}
    FROM PerAccount ${group?'GROUP BY '+group:''}
    ${grouping==='account'?'HAVING SUM(synced_count)>0':''}
    ${grouping==='account'||grouping==='category'?'ORDER BY total_views DESC,'+group:''}
  `).all(...where.values) as any[];
  return rows.map(row=>{
    row.account_count=Number(row.account_count||0); row.destination_count=Number(row.destination_count||0); row.total_synced_videos=Number(row.total_synced_videos||0);
    row.coverage=Object.fromEntries(metrics.map(([key])=>{
      const known=Number(row[`known_${key}`]||0),total=row.destination_count;
      return [key,{known,total,status:total>0&&known===total?'confirmed':known>0?'partial':'unavailable',observedTotal:row[`observed_${key}`]??null}];
    }));
    row.avg_engagement_rate=row.total_views===null||row.total_likes===null||row.total_comments===null||row.total_shares===null?null:row.total_views===0?0:Number(((row.total_likes+row.total_comments+row.total_shares)/row.total_views*100).toFixed(2));
    for (const [key] of metrics) {delete row[`known_${key}`];delete row[`observed_${key}`];}
    if(grouping==='category'){row.id=row.category_id;delete row.category_id;}
    if(grouping==='account'){row.current_followers=row.total_followers;row.last_synced_at=row.last_sync_time;row.engagement_rate=row.avg_engagement_rate;}
    return row;
  });
}

/** One latest cumulative observation per destination per Bangkok day. No sums of repeated polls. */
export function dailyCumulativeTrends(filter?: AnalyticsFilter) {
  const where=accountFilter(filter);
  return db.prepare(`
    WITH Daily AS (
      SELECT pms.*,a.platform AS account_platform,date(pms.observed_at,'+7 hours') day,
        ROW_NUMBER() OVER(PARTITION BY destination_id,date(pms.observed_at,'+7 hours') ORDER BY julianday(observed_at) DESC,pms.rowid DESC) rn
      FROM post_metrics_snapshots pms JOIN accounts a ON a.id=pms.account_id WHERE ${where.sql}
    )
    SELECT day AS date,
      CASE WHEN COUNT(CASE WHEN account_platform='facebook' THEN 1 END)>0 AND COUNT(CASE WHEN account_platform='facebook' THEN 1 END)=COUNT(CASE WHEN account_platform='facebook' AND provenance_status='confirmed' THEN view_count END) THEN SUM(CASE WHEN account_platform='facebook' THEN view_count END) END facebook_views,
      CASE WHEN COUNT(CASE WHEN account_platform='tiktok' THEN 1 END)>0 AND COUNT(CASE WHEN account_platform='tiktok' THEN 1 END)=COUNT(CASE WHEN account_platform='tiktok' AND provenance_status='confirmed' THEN view_count END) THEN SUM(CASE WHEN account_platform='tiktok' THEN view_count END) END tiktok_views,
      ${Object.entries(fields).map(([key,column])=>`CASE WHEN COUNT(*)=COUNT(CASE WHEN provenance_status='confirmed' THEN ${column} END) THEN SUM(${column}) END AS total_${key}`).join(',')},
      'Asia/Bangkok' timezone,'latest_cumulative_observation_per_destination_per_day' semantics
    FROM Daily WHERE rn=1 GROUP BY day ORDER BY day
  `).all(...where.values);
}
