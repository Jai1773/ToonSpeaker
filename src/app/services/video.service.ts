import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, NgZone, PLATFORM_ID, inject } from '@angular/core';
import {
  Observable,
  catchError,
  concatMap,
  defaultIfEmpty,
  filter,
  from,
  last,
  map,
  of,
  scan,
  shareReplay,
  switchMap,
  take,
  takeWhile,
} from 'rxjs';

export type SeriesType = 'cartoon' | 'anime' | 'movie';

export type SeriesListItem = {
  name: string;
  file: string;
  thumbnail: string;
  type: SeriesType;
};

export type SeriesVideo = {
  id: number;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  /**
   * Default playback URL (usually iframe/embed). If `streams` are provided,
   * the app may derive this value from the selected stream.
   */
  videoUrl: string;
  /**
   * Optional list of playable URLs for different video quality + audio tracks.
   */
  streams?: SeriesVideoStream[];
  thumbnail: string;
  description?: string;
};

export type SeriesVideoStream = {
  url: string;
  quality?: number; // e.g. 360, 720, 1080
  /**
   * Audio track name (e.g. English, Tamil).
   * `language` is accepted for backward compatibility.
   */
  audio?: string;
  language?: string;
};

export type SeriesVideoWithSeries = SeriesVideo & {
  seriesFile: string;
};

export type VideoSearchResult = SeriesVideoWithSeries;

@Injectable({
  providedIn: 'root',
})
export class VideoService {
  private readonly http = inject(HttpClient);
  private readonly ngZone = inject(NgZone);
  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  // Use root-relative URLs so deep routes like `/series/...` don't resolve to `/series/assets/...`
  private readonly seriesListUrl = '/assets/data/series.json';
  private readonly seriesDataBaseUrl = '/assets/data/';

  private seriesList$?: Observable<SeriesListItem[]>;
  private readonly seriesVideosCache = new Map<string, Observable<SeriesVideoWithSeries[]>>();

  private toFinitePositiveInt(value: unknown): number | null {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const rounded = Math.trunc(n);
    if (rounded <= 0) return null;
    return rounded;
  }

  private normalizeSeriesNameKey(value: unknown): string {
    if (typeof value !== 'string') return '';

    let s = value.trim();
    if (!s) return '';

    // Accept URL-encoded names from routes/query params.
    try {
      s = decodeURIComponent(s);
    } catch {
      // ignore
    }

    // Some inputs may contain '+' for spaces.
    s = s.replace(/\+/g, ' ');

    // Normalize punctuation/spacing so "Ben-10  Omniverse" matches "Ben 10 Omniverse".
    s = s.toLowerCase();
    s = s.replace(/[^a-z0-9]+/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();

    return s;
  }

  private normalizeStreams(value: unknown): SeriesVideoStream[] {
    if (!Array.isArray(value)) return [];

    const out: SeriesVideoStream[] = [];
    for (const raw of value) {
      if (!raw || typeof raw !== 'object') continue;

      const url = (raw as { url?: unknown }).url;
      if (typeof url !== 'string' || !url.trim()) continue;

      const quality = this.toFinitePositiveInt((raw as { quality?: unknown }).quality);

      const audioRaw = (raw as { audio?: unknown }).audio;
      const languageRaw = (raw as { language?: unknown }).language;
      const audio =
        (typeof audioRaw === 'string' && audioRaw.trim() ? audioRaw.trim() : '') ||
        (typeof languageRaw === 'string' && languageRaw.trim() ? languageRaw.trim() : '');

      out.push({
        url: url.trim(),
        quality: quality ?? undefined,
        audio: audio || undefined,
      });
    }

    return out;
  }

  private pickDefaultVideoUrl(streams: SeriesVideoStream[], preferredQuality = 720, preferredAudio = 'English'): string {
    if (!streams.length) return '';

    const tryMatch = (audio?: string, quality?: number) =>
      streams.find((s) => (audio ? (s.audio ?? '').trim() === audio : true) && (quality ? s.quality === quality : true));

    const exact = tryMatch(preferredAudio, preferredQuality);
    if (exact) return exact.url;

    const audioOnly = tryMatch(preferredAudio, undefined);
    if (audioOnly) return audioOnly.url;

    const qualityOnly = tryMatch(undefined, preferredQuality);
    if (qualityOnly) return qualityOnly.url;

    const withQuality = streams.filter((s) => typeof s.quality === 'number');
    if (withQuality.length) {
      const best = withQuality.slice().sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0))[0];
      if (best?.url) return best.url;
    }

    return streams[0].url;
  }

  private getJsonWithFallback<T>(primaryUrl: string, fallbackUrl: string): Observable<T> {
    return this.http.get<T>(primaryUrl).pipe(
      catchError((err) => {
        // Helps diagnose runtime issues (bad base href, SSR/dev-server differences, etc.)
        console.error('[VideoService] GET failed:', primaryUrl, err);
        return this.http.get<T>(fallbackUrl);
      }),
    );
  }

  private runInAngularZone<T>(source$: Observable<T>): Observable<T> {
    return new Observable<T>((observer) => {
      const sub = source$.subscribe({
        next: (value) => this.ngZone.run(() => observer.next(value)),
        error: (err) => this.ngZone.run(() => observer.error(err)),
        complete: () => this.ngZone.run(() => observer.complete()),
      });
      return () => sub.unsubscribe();
    });
  }

  getSeriesList(): Observable<SeriesListItem[]> {
    if (this.seriesList$) return this.seriesList$;

    if (!isPlatformBrowser(this.platformId)) {
      // Don't cache the server result; the browser should still be able to load data after hydration.
      return of([]);
    }

    this.seriesList$ = this.runInAngularZone(
      this.getJsonWithFallback<SeriesListItem[]>(this.seriesListUrl, this.seriesListUrl.replace(/^\//, '')).pipe(
        map((items) => (Array.isArray(items) ? items : [])),
        map((items) =>
          items.filter((s): s is SeriesListItem => {
            if (!s || typeof s !== 'object') return false;
            return (
              typeof s.name === 'string' &&
              typeof s.file === 'string' &&
              typeof s.thumbnail === 'string' &&
              (s.type === 'cartoon' || s.type === 'anime' || s.type === 'movie')
            );
          }),
        ),
        catchError(() => {
          // If the request fails (e.g., 404 due to bad base URL), don't permanently cache the empty result.
          this.seriesList$ = undefined;
          return of([] as SeriesListItem[]);
        }),
      ),
    ).pipe(shareReplay({ bufferSize: 1, refCount: false }));

    return this.seriesList$;
  }

  getVideosBySeries(fileName: string): Observable<SeriesVideoWithSeries[]> {
    const file = (fileName ?? '').trim();
    if (!file) return of([]);

    if (!isPlatformBrowser(this.platformId)) return of([]);

    const cached = this.seriesVideosCache.get(file);
    if (cached) return cached;

    const url = `${this.seriesDataBaseUrl}${file}`;
    const fallbackUrl = url.replace(/^\//, '');
    const req$ = this.runInAngularZone(
      this.getJsonWithFallback<SeriesVideo[]>(url, fallbackUrl).pipe(
        map((items) => (Array.isArray(items) ? items : [])),
        map((items) =>
          items
            .map((v) => {
              if (!v || typeof v !== 'object') return null;

              const id = Number((v as { id?: unknown }).id);
              const seasonNumber = Number((v as { seasonNumber?: unknown }).seasonNumber);
              const episodeNumber = Number((v as { episodeNumber?: unknown }).episodeNumber);
              const title = (v as { title?: unknown }).title;
              const thumbnail = (v as { thumbnail?: unknown }).thumbnail;
              const description = (v as { description?: unknown }).description;

              const streams = this.normalizeStreams((v as { streams?: unknown }).streams);
              const videoUrlRaw = (v as { videoUrl?: unknown }).videoUrl;
              const videoUrl =
                (typeof videoUrlRaw === 'string' && videoUrlRaw.trim() ? videoUrlRaw.trim() : '') ||
                this.pickDefaultVideoUrl(streams);

              if (!Number.isFinite(id)) return null;
              if (typeof title !== 'string') return null;
              if (!Number.isFinite(seasonNumber)) return null;
              if (!Number.isFinite(episodeNumber)) return null;
              if (!videoUrl) return null;
              if (typeof thumbnail !== 'string') return null;

              const desc = typeof description === 'string' && description.trim() ? description.trim() : undefined;

              const normalized: SeriesVideoWithSeries = {
                id,
                title,
                seasonNumber,
                episodeNumber,
                videoUrl,
                thumbnail,
                seriesFile: file,
                ...(streams.length ? { streams } : {}),
                ...(desc ? { description: desc } : {}),
              };

              return normalized;
            })
            .filter((v): v is SeriesVideoWithSeries => Boolean(v)),
        ),
        catchError(() => {
          // Same idea as seriesList$: clear the cache entry on failure so a later retry can succeed.
          this.seriesVideosCache.delete(file);
          return of([] as SeriesVideoWithSeries[]);
        }),
      ),
    ).pipe(shareReplay({ bufferSize: 1, refCount: false }));

    this.seriesVideosCache.set(file, req$);
    return req$;
  }

  getVideoById(seriesFile: string, id: number): Observable<SeriesVideoWithSeries | null> {
    const videoId = Number(id);
    if (!Number.isFinite(videoId)) return of(null);

    return this.getVideosBySeries(seriesFile).pipe(
      map((videos) => videos.find((v) => v.id === videoId) ?? null),
      catchError(() => of(null)),
    );
  }

  getRelatedVideos(seriesFile: string, currentId: number, limit = 12): Observable<SeriesVideoWithSeries[]> {
    const id = Number(currentId);
    if (!Number.isFinite(id)) return of([]);

    const max = Math.max(0, Math.min(50, Number(limit) || 0));

    return this.getVideosBySeries(seriesFile).pipe(
      map((videos) => videos.filter((v) => v.id !== id).slice(0, max)),
      catchError(() => of([])),
    );
  }

  /**
   * Deep-link helper: resolves a video by id without requiring the caller to know the series file.
   * This scans the series list sequentially and returns the first match.
   */
  findVideoByIdAcrossSeries(id: number): Observable<SeriesVideoWithSeries | null> {
    const videoId = Number(id);
    if (!Number.isFinite(videoId) || videoId <= 0) return of(null);

    return this.getSeriesList().pipe(
      switchMap((seriesList) =>
        from(seriesList).pipe(
          concatMap((s) =>
            this.getVideoById(s.file, videoId).pipe(
              map((video) => (video ? { ...video, seriesFile: s.file } : null)),
              catchError(() => of(null)),
            ),
          ),
          filter((v): v is SeriesVideoWithSeries => Boolean(v)),
          take(1),
          defaultIfEmpty(null),
          catchError(() => of(null)),
        ),
      ),
    );
  }

  searchVideos(query: string, limit = 10): Observable<VideoSearchResult[]> {
    const q = (query ?? '').trim().toLowerCase();
    const max = Math.max(0, Math.min(50, Number(limit) || 0));
    if (!q || !max) return of([]);

    // Avoid preloading everything: scan series files sequentially and stop once we have enough matches.
    return this.getSeriesList().pipe(
      switchMap((seriesList) =>
        from(seriesList).pipe(
          concatMap((s) =>
            this.getVideosBySeries(s.file).pipe(
              map((videos) =>
                videos.filter((v) => (v.title ?? '').toLowerCase().includes(q)),
              ),
              catchError(() => of([] as SeriesVideoWithSeries[])),
            ),
          ),
          scan((acc: VideoSearchResult[], matches: SeriesVideoWithSeries[]) => {
            if (acc.length >= max) return acc;
            const remaining = max - acc.length;
            if (!matches.length) return acc;
            return acc.concat(matches.slice(0, remaining));
          }, [] as VideoSearchResult[]),
          takeWhile((results) => results.length < max, true),
          last(),
          catchError(() => of([] as VideoSearchResult[])),
        ),
      ),
    );
  }

  searchSeries(query: string, limit = 6): Observable<SeriesListItem[]> {
    const q = (query ?? '').trim().toLowerCase();
    const max = Math.max(0, Math.min(20, Number(limit) || 0));
    if (!q || !max) return of([]);

    return this.getSeriesList().pipe(
      map((items) =>
        items
          .filter((s) => (s.name ?? '').toLowerCase().includes(q))
          .slice(0, max),
      ),
      catchError(() => of([])),
    );
  }

  getSeriesByName(name: string): Observable<SeriesListItem | null> {
    const n = this.normalizeSeriesNameKey(name);
    if (!n) return of(null);

    return this.getSeriesList().pipe(
      map((items) => {
        const exact = items.find((s) => this.normalizeSeriesNameKey(s.name) === n) ?? null;
        if (exact) return exact;

        // Fallback: allow a unique partial match (helps when the route name differs slightly).
        const partial = items.filter((s) => this.normalizeSeriesNameKey(s.name).includes(n));
        if (partial.length === 1) return partial[0] ?? null;

        return null;
      }),
      catchError(() => of(null)),
    );
  }

  getSeriesByFile(fileName: string): Observable<SeriesListItem | null> {
    const f = (fileName ?? '').trim().toLowerCase();
    if (!f) return of(null);

    return this.getSeriesList().pipe(
      map((items) => items.find((s) => (s.file ?? '').trim().toLowerCase() === f) ?? null),
      catchError(() => of(null)),
    );
  }
}
