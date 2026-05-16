export type VideoProvider = 'youtube' | 'loom' | 'vimeo';

export interface ParsedVideo {
  provider: VideoProvider;
  videoId: string;
  embedUrl: string;
  thumbnailUrl: string;
}

const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
];

const VIMEO_PATTERNS = [
  /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/,
];

const LOOM_PATTERNS = [
  /loom\.com\/(?:share|embed)\/([a-f0-9]{32})/,
];

function matchFirst(url: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function parseVideoUrl(url: string): ParsedVideo | null {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();

  const youtubeId = matchFirst(trimmed, YOUTUBE_PATTERNS);
  if (youtubeId) {
    return {
      provider: 'youtube',
      videoId: youtubeId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1`,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }

  const vimeoId = matchFirst(trimmed, VIMEO_PATTERNS);
  if (vimeoId) {
    return {
      provider: 'vimeo',
      videoId: vimeoId,
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
      thumbnailUrl: '/images/video-placeholder.svg',
    };
  }

  const loomId = matchFirst(trimmed, LOOM_PATTERNS);
  if (loomId) {
    return {
      provider: 'loom',
      videoId: loomId,
      embedUrl: `https://www.loom.com/embed/${loomId}`,
      thumbnailUrl: `https://cdn.loom.com/sessions/thumbnails/${loomId}-with-play.gif`,
    };
  }

  return null;
}
