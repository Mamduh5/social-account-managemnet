import { createHash } from 'node:crypto';

export function pipelineSourceFingerprint(source: string): string {
  return createHash('sha256').update(source.replace(/\/+$/, '')).digest('hex');
}

/** Legacy rows match only when their saved upstream URL proves the configured source. */
export function pipelineVideoMatchesSource(metadataJson: string | null | undefined, source: string): boolean {
  try {
    const metadata = JSON.parse(metadataJson || '{}');
    if (metadata.pipelineSourceFingerprint) return metadata.pipelineSourceFingerprint === pipelineSourceFingerprint(source);
    if (typeof metadata.upstreamVideoUrl !== 'string') return false;
    const base = new URL(source.replace(/\/+$/, '') + '/');
    const video = new URL(metadata.upstreamVideoUrl);
    return video.origin === base.origin && video.pathname.startsWith(base.pathname);
  } catch { return false; }
}

export function pipelineVideoHasSource(metadataJson: string | null | undefined): boolean {
  try {
    const metadata = JSON.parse(metadataJson || '{}');
    if (typeof metadata.pipelineSourceFingerprint === 'string' && /^[a-f0-9]{64}$/.test(metadata.pipelineSourceFingerprint)) return true;
    return typeof metadata.upstreamVideoUrl === 'string' && ['http:','https:'].includes(new URL(metadata.upstreamVideoUrl).protocol);
  } catch { return false; }
}
