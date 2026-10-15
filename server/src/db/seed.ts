import { db } from './database.js';

export function seedInitialData() {
  const existingCategories = db.prepare('SELECT count(*) as count FROM categories').get() as { count: number };
  if (existingCategories.count > 0) {
    return; // Already seeded
  }

  console.log('[Seed] Seeding initial categories, accounts, brand kits, comments, and analytics...');

  // 1. Categories
  const insertCat = db.prepare(`
    INSERT INTO categories (id, name, slug, description, color)
    VALUES (?, ?, ?, ?, ?)
  `);

  const cat1Id = 'cat-obj-life';
  const cat2Id = 'cat-scr-life';
  const cat3Id = 'cat-cin-ai';

  insertCat.run(cat1Id, 'Object to Life', 'object-to-life', 'Inanimate everyday objects brought to life with personality and voice', '#3B82F6');
  insertCat.run(cat2Id, 'Screen to Life', 'screen-to-life', 'Digital 2D UI concepts & gaming characters transitioning into physical reality', '#8B5CF6');
  insertCat.run(cat3Id, 'Cinematic AI / Commercials', 'cinematic-ai', 'High-end stylized commercial aesthetics and cinematic storytelling', '#EC4899');

  // 2. Brand Kits
  const brandKit1 = JSON.stringify({
    watermarkType: 'moving_text',
    text: '@ObjectToLife',
    movementPreset: 'diagonal_bounce',
    speedSeconds: 12,
    fontSize: 26,
    opacity: 0.85,
    fontColor: '#FFFFFF',
    boxBgColor: '#000000',
    boxBgOpacity: 0.45,
    safeArea: { top: 120, bottom: 260, left: 40, right: 120 },
    enableSignature: true,
    signatureText: 'Crafted with AI Engine #ObjectToLife'
  });

  const brandKit2 = JSON.stringify({
    watermarkType: 'moving_text',
    text: '@object.to.life',
    movementPreset: 'smooth_sine',
    speedSeconds: 15,
    fontSize: 24,
    opacity: 0.80,
    fontColor: '#00F2FE',
    boxBgColor: '#000000',
    boxBgOpacity: 0.5,
    safeArea: { top: 130, bottom: 320, left: 50, right: 140 },
    enableSignature: true,
    signatureText: 'Watch everyday magic | Object to Life'
  });

  const brandKit3 = JSON.stringify({
    watermarkType: 'moving_text',
    text: '@ScreenToLifeStudio',
    movementPreset: 'corner_jump',
    intervalSeconds: 6,
    fontSize: 24,
    opacity: 0.80,
    fontColor: '#A78BFA',
    boxBgColor: '#1E1B4B',
    boxBgOpacity: 0.6,
    safeArea: { top: 100, bottom: 200, left: 40, right: 80 },
    enableSignature: true,
    signatureText: 'Where pixels meet reality'
  });

  const brandKit4 = JSON.stringify({
    watermarkType: 'moving_text',
    text: '@screen2life.ai',
    movementPreset: 'smooth_sine',
    speedSeconds: 14,
    fontSize: 22,
    opacity: 0.75,
    fontColor: '#E0E7FF',
    boxBgColor: '#0F172A',
    boxBgOpacity: 0.5,
    safeArea: { top: 140, bottom: 330, left: 40, right: 130 },
    enableSignature: true,
    signatureText: 'Next-gen screen synthesis'
  });

  const brandKit5 = JSON.stringify({
    watermarkType: 'moving_text',
    text: '@CinematicAIShorts',
    movementPreset: 'smooth_sine',
    speedSeconds: 18,
    fontSize: 26,
    opacity: 0.85,
    fontColor: '#FDE047',
    boxBgColor: '#1C1917',
    boxBgOpacity: 0.55,
    safeArea: { top: 100, bottom: 180, left: 50, right: 80 },
    enableSignature: true,
    signatureText: 'Cinematic AI Studios © 2026'
  });

  const brandKit6 = JSON.stringify({
    watermarkType: 'moving_text',
    text: '@cinematic.ai.creations',
    movementPreset: 'corner_jump',
    intervalSeconds: 8,
    fontSize: 24,
    opacity: 0.80,
    fontColor: '#F472B6',
    boxBgColor: '#3B0764',
    boxBgOpacity: 0.5,
    safeArea: { top: 140, bottom: 320, left: 40, right: 130 },
    enableSignature: true,
    signatureText: 'Commercial Vision Lab'
  });

  // 3. Accounts (3 Facebook Pages, 3 TikTok Accounts)
  const insertAccount = db.prepare(`
    INSERT INTO accounts (id, category_id, platform, account_type, name, handle, avatar_url, status, connector_mode, brand_kit_json, health_status, last_health_check)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  insertAccount.run('acc-fb-1', cat1Id, 'facebook', 'page', 'ObjectToLife Official', '@ObjectToLifeOfficial', 'https://images.unsplash.com/photo-1546776310-eef45dd6d63c?w=150', 'connected', 'simulator', brandKit1, 'Healthy');
  insertAccount.run('acc-tt-1', cat1Id, 'tiktok', 'personal', 'Object to Life', '@object.to.life', 'https://images.unsplash.com/photo-1546776310-eef45dd6d63c?w=150', 'connected', 'simulator', brandKit2, 'Healthy');

  insertAccount.run('acc-fb-2', cat2Id, 'facebook', 'page', 'ScreenToLife Studio', '@ScreenToLifeStudio', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150', 'connected', 'simulator', brandKit3, 'Healthy');
  insertAccount.run('acc-tt-2', cat2Id, 'tiktok', 'business', 'Screen2Life AI', '@screen2life.ai', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150', 'connected', 'simulator', brandKit4, 'Healthy');

  insertAccount.run('acc-fb-3', cat3Id, 'facebook', 'page', 'Cinematic AI Shorts', '@CinematicAIShorts', 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=150', 'connected', 'simulator', brandKit5, 'Healthy');
  insertAccount.run('acc-tt-3', cat3Id, 'tiktok', 'business', 'Cinematic AI Creations', '@cinematic.ai.creations', 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=150', 'expired', 'simulator', brandKit6, 'Token Expired (Needs Reauth)');

  // 4. Initial Realistic Comments
  const insertComment = db.prepare(`
    INSERT INTO comments (id, account_id, platform, external_comment_id, author_name, author_avatar, content, created_time, like_count, status, awaiting_reply, has_replied, video_title, native_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?), ?, ?, ?, ?, ?, ?)
  `);

  insertComment.run('cmt-1', 'acc-fb-1', 'facebook', 'fb-cmt-101', 'Alex Mercer', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80', 'The coffee cup animation had so much emotion! What prompt did you use for the steam physics?', '-2 hours', 14, 'unread', 1, 0, 'Morning Espresso Wakes Up', 'https://facebook.com/watch?v=mock101');
  insertComment.run('cmt-2', 'acc-tt-1', 'tiktok', 'tt-cmt-201', 'Sophia Chen', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80', 'Can you please animate a toaster next?! This series is so wholesome ❤️', '-4 hours', 42, 'unread', 1, 0, 'Morning Espresso Wakes Up', 'https://tiktok.com/@object.to.life/video/mock201');
  insertComment.run('cmt-3', 'acc-fb-2', 'facebook', 'fb-cmt-102', 'David Kim', 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=80', 'That neon holographic HUD transition into the glass desk looks unreal. Is that Flow or Blender compositing?', '-8 hours', 29, 'pending', 1, 0, 'Cyberpunk HUD Materializes', 'https://facebook.com/watch?v=mock102');
  insertComment.run('cmt-4', 'acc-tt-2', 'tiktok', 'tt-cmt-202', 'Elena Rostova', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80', 'The sound effects matched every pixel perfectly! Followed!', '-12 hours', 88, 'handled', 0, 1, 'Cyberpunk HUD Materializes', 'https://tiktok.com/@screen2life.ai/video/mock202');
  insertComment.run('cmt-5', 'acc-fb-3', 'facebook', 'fb-cmt-103', 'Marcus Vance', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80', 'Would love to collaborate on a luxury watch commercial concept with your pipeline.', '-1 day', 5, 'unread', 1, 0, 'Midnight Chronograph Commercial', 'https://facebook.com/watch?v=mock103');
  insertComment.run('cmt-6', 'acc-tt-3', 'tiktok', 'tt-cmt-203', 'Liam O\'Connor', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80', 'Lighting in the rain scene is cinematic masterpiece tier. How many iterations did it take?', '-1 day', 156, 'unread', 1, 0, 'Midnight Chronograph Commercial', 'https://tiktok.com/@cinematic.ai.creations/video/mock203');

  // 5. Initial Activity Events
  const insertActivity = db.prepare(`
    INSERT INTO activity_events (id, type, account_id, category_id, title, message, severity, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);

  insertActivity.run('act-1', 'viral_spike', 'acc-tt-1', cat1Id, 'Viral Engagement Spike', 'Video "Morning Espresso Wakes Up" crossed 15,000 views in the last 2 hours on TikTok!', 'success', '-1 hour');
  insertActivity.run('act-2', 'comment_received', 'acc-fb-1', cat1Id, 'New Comment from Alex Mercer', '"The coffee cup animation had so much emotion! What prompt did you use..."', 'info', '-2 hours');
  insertActivity.run('act-3', 'publish_success', 'acc-fb-2', cat2Id, 'Video Published Successfully', '"Cyberpunk HUD Materializes" published to Facebook Page ScreenToLife Studio', 'success', '-8 hours');
  insertActivity.run('act-4', 'publish_success', 'acc-tt-2', cat2Id, 'Video Published Successfully', '"Cyberpunk HUD Materializes" published to TikTok @screen2life.ai', 'success', '-8 hours');
  insertActivity.run('act-5', 'account_alert', 'acc-tt-3', cat3Id, 'Account Authorization Expired', 'TikTok session for @cinematic.ai.creations expired. Reauthorization required to resume queue.', 'warning', '-1 day');

  // 6. Analytics Snapshots (Last 7 days of realistic comparative metrics)
  const insertSnapshot = db.prepare(`
    INSERT INTO analytics_snapshots (id, account_id, date, views, likes, comments, shares, followers_total, followers_gain, watch_time_seconds, engagement_rate, is_simulated)
    VALUES (?, ?, date('now', ?), ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const accounts = [
    { id: 'acc-fb-1', baseViews: 3200, baseFollowers: 12400 },
    { id: 'acc-tt-1', baseViews: 8500, baseFollowers: 34200 },
    { id: 'acc-fb-2', baseViews: 4100, baseFollowers: 18900 },
    { id: 'acc-tt-2', baseViews: 11200, baseFollowers: 45600 },
    { id: 'acc-fb-3', baseViews: 2800, baseFollowers: 9500 },
    { id: 'acc-tt-3', baseViews: 6400, baseFollowers: 22100 },
  ];

  for (const acc of accounts) {
    for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
      const dayMod = (7 - dayOffset) * 0.15;
      const views = Math.round(acc.baseViews * (1 + dayMod + Math.sin(dayOffset) * 0.2));
      const likes = Math.round(views * 0.082);
      const comments = Math.round(views * 0.012);
      const shares = Math.round(views * 0.006);
      const followersGain = Math.round(views * 0.008);
      const followersTotal = acc.baseFollowers + (6 - dayOffset) * followersGain;
      const watchTimeSeconds = Math.round(views * 18);
      const engagementRate = +(((likes + comments + shares) / (views || 1)) * 100).toFixed(2);

      insertSnapshot.run(
        `snap-${acc.id}-${dayOffset}`,
        acc.id,
        `-${dayOffset} days`,
        views,
        likes,
        comments,
        shares,
        followersTotal,
        followersGain,
        watchTimeSeconds,
        engagementRate
      );
    }
  }

  // 7. App Settings
  const insertSetting = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
  insertSetting.run('pipeline_watch_dir', 'D:\\Mamduh\\Personal\\ai-video-pipeline\\.tmp-live-validation');
  insertSetting.run('app_timezone', 'Asia/Bangkok');
  insertSetting.run('default_retry_count', '3');
  insertSetting.run('brand_studio_default_ratio', '9:16');
  insertSetting.run('active_environment', 'production_local');

  console.log('[Seed] Seeding completed successfully.');
}
