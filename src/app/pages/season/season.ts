import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SeriesVideoStream, SeriesVideoWithSeries, VideoService } from '../../services/video.service';
import { map, switchMap, tap } from 'rxjs/operators';
import { Observable, combineLatest, of } from 'rxjs';
import { VideoCard } from '../../components/video-card/video-card';

type SeasonSummary = {
  seasonNumber: number;
  episodeCount: number;
  thumbnail: string;
};

@Component({
  selector: 'app-season',
  standalone: true,
  imports: [CommonModule, RouterModule, VideoCard],
  templateUrl: './season.html',
  styleUrls: ['./season.scss'],
})
export class SeasonPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private videoService = inject(VideoService);
  private sanitizer = inject(DomSanitizer);

  vm$: Observable<any>;

  constructor() {
    this.vm$ = combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
      map(([params, queryParams]) => ({
        name: params.get('name') ?? '',
        seasonParam: params.get('season'),
        movieVideoId: Number(params.get('videoId') ?? '0'),
        queryVideoId: Number(queryParams.get('video') ?? '0'),
      })),
      switchMap(({ name, seasonParam, movieVideoId, queryVideoId }) => {
        const season = Number(seasonParam ?? '1');
        const selectedVideoId =
          Number.isFinite(movieVideoId) && movieVideoId > 0
            ? movieVideoId
            : Number.isFinite(queryVideoId) && queryVideoId > 0
              ? queryVideoId
              : 0;

        const resolved$ = this.videoService.getSeriesByName(name).pipe(
          switchMap((series) => {
            if (series) return of(series);
            const file = name.toLowerCase().endsWith('.json') ? name : `${name}.json`;
            return this.videoService.getSeriesByFile(file);
          })
        );

        return resolved$.pipe(
          switchMap((series) => {
            if (!series) {
              return of({ seriesInfo: null, seasonInfo: null, episodes: [] });
            }

            return this.videoService.getVideosBySeries(series.file).pipe(
              map((videos) => {
                const isMovie = series.type === 'movie';
                const episodes = (isMovie ? videos : videos.filter((v) => v.seasonNumber === season))
                  .sort((a, b) => {
                    if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
                    if (a.episodeNumber !== b.episodeNumber) return a.episodeNumber - b.episodeNumber;
                    return a.id - b.id;
                  });
                const nextSeasons = isMovie ? [] : this.buildNextSeasons(videos, season);

                const seasonInfo = {
                  seasonNumber: isMovie ? 1 : season,
                  episodeCount: episodes.length,
                  thumbnail: episodes[0]?.thumbnail || series.thumbnail || '',
                };

                return {
                  seriesInfo: series,
                  seasonInfo,
                  episodes,
                  nextSeasons,
                  isMovie,
                };
              }),
              tap((res) => {
                if (!res?.episodes?.length) return;

                if (res.isMovie && seasonParam) {
                  const selectedMovie =
                    res.episodes.find((e: SeriesVideoWithSeries) => e.id === selectedVideoId) ||
                    res.episodes[0];
                  this.openMovieRoute(selectedMovie, res.seriesInfo?.file || '', true);
                  return;
                }

                if (Number.isFinite(selectedVideoId) && selectedVideoId > 0) {
                  const selectedFromRoute = res.episodes.find(
                    (e: SeriesVideoWithSeries) => e.id === selectedVideoId
                  );
                  if (selectedFromRoute) {
                    this.selectEpisode(selectedFromRoute);
                    return;
                  }
                }

                const seriesFile = res.seriesInfo?.file || '';
                const prefs = seriesFile ? this.loadPrefs(seriesFile) : null;

                if (
                  prefs?.lastWatchedEpisodeId &&
                  (res.isMovie || prefs?.lastWatchedSeasonNumber === season)
                ) {
                  const found = res.episodes.find(
                    (e: SeriesVideoWithSeries) => e.id === prefs.lastWatchedEpisodeId
                  );
                  if (found) {
                    this.selectEpisode(found);
                    return;
                  }
                }

                this.selectEpisode(res.episodes[0]);
              })
            );
          })
        );
      })
    );

    this.hasAudioDetails = false;
  }

  currentVideo: SeriesVideoWithSeries | null = null;
  safeVideoUrl: SafeResourceUrl | null = null;

  servers: { id: string; label: string; streams: SeriesVideoStream[] }[] = [];
  selectedServerIndex = 0;
  selectedServerId = '';

  availableAudios: string[] = [];
  selectedAudio = '';

  hasAudioDetails = false;

  selectEpisode(video: SeriesVideoWithSeries) {
    this.currentVideo = video;
    this.setPlaybackOptions(video);

    const seriesFile = video.seriesFile || '';
    if (seriesFile) {
      this.savePrefs(seriesFile, {
        lastWatchedEpisodeId: video.id,
        lastWatchedSeasonNumber: video.seasonNumber,
        selectedServerId: this.selectedServerId,
        selectedAudio: this.selectedAudio,
      });
    }
  }

  private setPlaybackOptions(video: SeriesVideoWithSeries) {
    if (!video) return;

    const streams =
      Array.isArray(video.streams) && video.streams.length
        ? video.streams
        : [{ url: video.videoUrl }];

    const serverMap = new Map<string, SeriesVideoStream[]>();

    const hasServerField = streams.some((s) => {
      const raw = (s as any).server ?? (s as any).serverId;
      return raw !== undefined && String(raw).trim() !== '';
    });

    for (const s of streams) {
      let serverKey: string;

      if (hasServerField) {
        serverKey =
          String((s as any).server ?? (s as any).serverId ?? 'unknown').trim() ||
          'unknown';
      } else {
        try {
          const url = new URL((s as any).url || '');
          serverKey = url.hostname || 'unknown';
        } catch {
          serverKey = 'unknown';
        }
      }

      if (!serverMap.has(serverKey)) serverMap.set(serverKey, []);
      serverMap.get(serverKey)!.push(s);
    }

    this.servers = Array.from(serverMap.entries()).map(([id, list], i) => ({
      id,
      label: hasServerField ? `Server ${id}` : `Server ${i + 1}`,
      streams: list,
    }));

    this.selectedServerIndex = 0;
    this.selectedServerId = this.servers[0]?.id || '';

    const seriesFile = video.seriesFile || '';
    const prefs = seriesFile ? this.loadPrefs(seriesFile) : null;

    this.updateAudios();

    if (prefs) {
      if (prefs.selectedServerId) {
        const idx = this.servers.findIndex((s) => s.id === prefs.selectedServerId);
        if (idx >= 0) {
          this.selectedServerIndex = idx;
          this.selectedServerId = this.servers[idx].id;
          this.updateAudios();
        }
      }

      if (prefs.selectedAudio) {
        const found = this.availableAudios.find(
          (a) => a.toLowerCase() === prefs.selectedAudio!.toLowerCase()
        );
        if (found) this.selectedAudio = found;
      }
    }

    this.updateVideo();

    this.hasAudioDetails = this.availableAudios.some(
      (a) => a && a.toLowerCase() !== 'unknown'
    );
  }

  private updateAudios() {
    const server = this.servers[this.selectedServerIndex];
    if (!server) return;

    const audioSet = new Set<string>();

    for (const s of server.streams) {
      const audio = (s as any).audio?.trim() || 'Unknown';
      audioSet.add(audio);
    }

    this.availableAudios = Array.from(audioSet);

    this.selectedAudio =
      this.availableAudios.find((a) => a.toLowerCase() === 'tamil') || this.availableAudios[0];
  }

  private updateVideo() {
    const server = this.servers[this.selectedServerIndex];
    if (!server) return;

    const stream =
      server.streams.find(
        (s) => (s as any).audio?.toLowerCase() === this.selectedAudio.toLowerCase()
      ) || server.streams[0];

    this.safeVideoUrl = this.sanitize(stream.url);
  }

  onServerSelect(event: Event) {
    const val = (event.target as HTMLSelectElement).value;

    const index = this.servers.findIndex((s) => s.id === val);

    if (index !== -1) {
      this.selectedServerIndex = index;
      this.selectedServerId = this.servers[index].id;

      this.updateAudios();
      this.updateVideo();

      if (this.currentVideo?.seriesFile) {
        this.savePrefs(this.currentVideo.seriesFile, {
          selectedServerId: this.selectedServerId,
          selectedAudio: this.selectedAudio,
        });
      }
    }
  }

  onAudioChange(event: Event) {
    this.selectedAudio = (event.target as HTMLSelectElement).value;

    this.updateVideo();

    if (this.currentVideo?.seriesFile) {
      this.savePrefs(this.currentVideo.seriesFile, {
        selectedAudio: this.selectedAudio,
      });
    }
  }

  private prefsKeyForSeries(seriesFile: string) {
    return `player:series:${seriesFile}`;
  }

  private loadPrefs(seriesFile: string) {
    try {
      const raw = localStorage.getItem(this.prefsKeyForSeries(seriesFile));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private savePrefs(seriesFile: string, data: any) {
    try {
      const cur = this.loadPrefs(seriesFile) || {};
      localStorage.setItem(
        this.prefsKeyForSeries(seriesFile),
        JSON.stringify({ ...cur, ...data })
      );
    } catch {}
  }

  private sanitize(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  fallbackThumbnail = '/assets/thambnails/placeholder.svg';

  onImgError(event: Event) {
    (event.target as HTMLImageElement).src = this.fallbackThumbnail;
  }

  protected isMovieSeries(seriesInfo: { type?: string } | null | undefined): boolean {
    return seriesInfo?.type === 'movie';
  }

  protected openSeasonVideo(video: SeriesVideoWithSeries, seriesFile: string, isMovie = false) {
    if (!video || !seriesFile) return;

    if (isMovie) {
      this.openMovieRoute(video, seriesFile);
      return;
    }

    const slug = seriesFile.replace(/\.json$/i, '');
    this.router.navigate(['/series', slug, 'season', video.seasonNumber], {
      state: { file: seriesFile },
      queryParams: { video: video.id },
    });
  }

  private openMovieRoute(
    video: SeriesVideoWithSeries,
    seriesFile: string,
    replaceUrl = false
  ) {
    if (!video || !seriesFile) return;

    const slug = seriesFile.replace(/\.json$/i, '');
    this.router.navigate(['/series', slug, 'movie', video.id], {
      state: { file: seriesFile },
      replaceUrl,
    });
  }

  private buildNextSeasons(
    videos: SeriesVideoWithSeries[],
    currentSeason: number
  ): SeasonSummary[] {
    const bySeason = new Map<number, SeriesVideoWithSeries[]>();

    for (const video of videos) {
      const seasonNumber = Number(video.seasonNumber);
      if (!Number.isFinite(seasonNumber) || seasonNumber <= currentSeason) continue;

      const items = bySeason.get(seasonNumber);
      if (items) items.push(video);
      else bySeason.set(seasonNumber, [video]);
    }

    return [...bySeason.entries()]
      .map(([seasonNumber, items]) => ({
        seasonNumber,
        episodeCount: items.length,
        thumbnail:
          items.find((item) => typeof item.thumbnail === 'string' && item.thumbnail)?.thumbnail || '',
      }))
      .sort((a, b) => a.seasonNumber - b.seasonNumber);
  }
}
