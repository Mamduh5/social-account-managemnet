/** Public identity validation only; a valid URL does not prove ownership or Page type. */
export function normalizeIdentity(platform: string, input: string) {
  if (!['facebook', 'tiktok'].includes(platform))
    throw new Error('Only Facebook Pages and TikTok are supported');
  let value = String(input || '').trim();
  if (!value || value.length > 500)
    throw new Error('Enter a public profile URL or username');
  let numericId = '';
  if (
    /^(https?:\/\/|www\.|(?:m\.)?facebook\.com\/|(?:www\.)?tiktok\.com\/)/i.test(
      value
    )
  ) {
    const url = new URL(/^https?:/i.test(value) ? value : `https://${value}`);
    const hosts =
      platform === 'facebook'
        ? ['facebook.com', 'www.facebook.com', 'm.facebook.com']
        : ['tiktok.com', 'www.tiktok.com'];
    if (
      !hosts.includes(url.hostname.toLowerCase()) ||
      url.username ||
      url.password ||
      url.port
    )
      throw new Error(
        'Use an official public Facebook Page or TikTok profile URL'
      );
    const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    if (
      platform === 'facebook' &&
      parts[0] === 'profile.php' &&
      parts.length === 1
    ) {
      numericId = url.searchParams.get('id') || '';
      if (!/^\d+$/.test(numericId))
        throw new Error('A numeric Facebook Page ID is required');
      value = numericId;
    } else if (
      platform === 'facebook' &&
      parts[0] === 'pages' &&
      parts.length === 3 &&
      /^\d+$/.test(parts[2])
    ) {
      value = numericId = parts[2];
    } else {
      if (
        parts.length !== 1 ||
        (platform === 'tiktok' && !parts[0].startsWith('@'))
      )
        throw new Error('Use a profile URL, not a post, video, or login URL');
      value = parts[0];
    }
  }
  value = value.replace(/^@/, '').toLowerCase();
  if (platform === 'tiktok') {
    if (!/^[a-z0-9_][a-z0-9_.]{1,23}$/.test(value) || value.endsWith('.'))
      throw new Error(
        'Invalid TikTok username (2-24 letters, numbers, underscores or periods)'
      );
  } else {
    if (
      !/^[a-z0-9.]+$/.test(value) ||
      [
        'login',
        'watch',
        'reel',
        'reels',
        'groups',
        'events',
        'marketplace',
        'share',
        'profile.php',
        'settings',
        'home.php',
        'pages',
      ].includes(value)
    )
      throw new Error('Enter a Facebook Page username or numeric Page ID');
    if (/^\d+$/.test(value)) numericId = value;
  }
  return {
    handle: `@${value}`,
    key: `${numericId ? 'id' : 'handle'}:${platform === 'facebook' ? value.replace(/\./g, '') : value}`,
    publicUrl:
      platform === 'facebook'
        ? numericId
          ? `https://www.facebook.com/profile.php?id=${numericId}`
          : `https://www.facebook.com/${value}`
        : `https://www.tiktok.com/@${value}`,
    numericId,
  };
}
export function validateAvatar(value: unknown): string {
  if (!value) return '';
  if (
    typeof value === 'string' &&
    /^\/uploads\/avatars\/[a-f0-9-]+\.(png|jpg|webp)$/.test(value)
  )
    return value;
  const url = new URL(String(value));
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    String(value).length > 2000
  )
    throw new Error('Avatar must be an HTTPS image URL');
  return url.href;
}
export function validatePublishedUrl(platform: string, input: string): string {
  const url = new URL(input);
  const hosts =
    platform === 'facebook'
      ? ['facebook.com', 'www.facebook.com', 'm.facebook.com']
      : ['tiktok.com', 'www.tiktok.com'];
  if (
    url.protocol !== 'https:' ||
    !hosts.includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error('Enter the published post URL on the selected platform');
  const valid =
    platform === 'tiktok'
      ? /^\/@[\w.]+\/video\/\d+\/?$/.test(url.pathname)
      : /\/(posts|videos|reel)\/[\w.]+/.test(url.pathname) ||
        (url.pathname === '/watch' &&
          /^\d+$/.test(url.searchParams.get('v') || '')) ||
        (url.pathname === '/permalink.php' &&
          /^\d+$/.test(url.searchParams.get('story_fbid') || ''));
  if (!valid)
    throw new Error('Enter a post or video URL, not a profile or homepage');
  return url.href;
}
