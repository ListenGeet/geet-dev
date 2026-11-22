export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  language?: string | null;
  genre?: string | null;
  durationMs?: number | null;
  waveform?: number[] | null;
  coverUrl?: string;
}

export interface Lyrics {
  plain: string | null;
  synced: { t_ms: number; line: string }[] | null;
  source?: 'uploader' | 'lrclib' | 'lyrics_ovh';
}
