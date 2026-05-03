import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  SeriesListItem,
  SeriesType,
  SeriesVideoWithSeries,
  VideoService,
} from '../../services/video.service';
import { VideoCard } from '../../components/video-card/video-card';
import { map, switchMap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';

type SeriesHeaderInfo = {
  name: string;
  thumbnail: string;
  count: number;
  type: SeriesType;
};

type SeasonSummary = {
  seasonNumber: number;
  episodeCount: number;
  thumbnail: string;
};

@Component({
  selector: 'app-series',
  standalone: true,
  imports: [CommonModule, RouterModule, VideoCard],
  templateUrl: './series.html',
  styleUrls: ['./series.scss'],
})
export class Series {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly videoService = inject(VideoService);

  protected readonly fallbackThumbnail = '/assets/thambnails/placeholder.svg';

  seriesName = '';
  seriesFile = '';

  // ✅ Combined reactive state
  vm$: Observable<{
    seriesInfo: SeriesHeaderInfo | null;
    seasons: SeasonSummary[];
    videos: SeriesVideoWithSeries[];
    seriesName: string;
    seriesFile: string;
  }> = this.route.paramMap.pipe(
    map((params) => {
      const raw = (params.get('name') ?? '').trim();
      return this.safeDecodeURIComponent(raw);
    }),
    switchMap((name) => {
      this.seriesName = name;

      // First try resolving by human-readable name; if that fails,
      // treat the param as a slug (series file basename) and try
      // getSeriesByFile(slug + '.json').
      const resolveSeries$ = this.videoService.getSeriesByName(name).pipe(
        switchMap((series) => {
          if (series) return of(series);
          const file = name.toLowerCase().endsWith('.json') ? name : `${name}.json`;
          return this.videoService.getSeriesByFile(file);
        })
      );

      return resolveSeries$.pipe(
        switchMap((series) => {
          if (!series) {
            return of({
              seriesInfo: null,
              seasons: [],
              videos: [],
              seriesName: name,
              seriesFile: '',
            });
          }

          this.seriesFile = series.file;

          return this.videoService.getVideosBySeries(series.file).pipe(
            map((videos) => ({
              seriesInfo: {
                name: series.name,
                thumbnail: series.thumbnail,
                count: videos.length,
                type: series.type,
              },
              seasons: this.buildSeasons(series, videos),
              videos: this.sortVideos(videos),
              seriesName: name,
              seriesFile: series.file,
            }))
          );
        })
      );
    })
  );

  onImgError(event: Event) {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;
    if (img.src.includes(this.fallbackThumbnail)) return;
    img.src = this.fallbackThumbnail;
  }

  protected isMovieType(seriesInfo: SeriesHeaderInfo | null): boolean {
    return seriesInfo?.type === 'movie';
  }

  protected getCountLabel(seriesInfo: SeriesHeaderInfo | null): string {
    if (!seriesInfo) return '';
    return `${seriesInfo.count} ${seriesInfo.type === 'movie' ? 'movies' : 'episodes'}`;
  }

  protected openMovie(video: SeriesVideoWithSeries, seriesFile: string) {
    if (!video || !seriesFile) return;

    const slug = seriesFile.replace(/\.json$/i, '');
    this.router.navigate(['/series', slug, 'movie', video.id], {
      state: { file: seriesFile },
    });
  }

  private sortVideos(videos: SeriesVideoWithSeries[]): SeriesVideoWithSeries[] {
    return [...videos].sort((a, b) => {
      if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
      if (a.episodeNumber !== b.episodeNumber) return a.episodeNumber - b.episodeNumber;
      return a.id - b.id;
    });
  }

  private buildSeasons(
    series: SeriesListItem,
    videos: SeriesVideoWithSeries[]
  ): SeasonSummary[] {
    if (series.type === 'movie') return [];

    const bySeason = new Map<number, SeriesVideoWithSeries[]>();

    for (const v of videos) {
      const season = Number(v.seasonNumber);
      if (!Number.isFinite(season) || season <= 0) continue;

      const existing = bySeason.get(season);
      if (existing) existing.push(v);
      else bySeason.set(season, [v]);
    }

    return [...bySeason.entries()]
      .map(([seasonNumber, eps]) => {
        const firstThumb =
          eps.find((e) => typeof e?.thumbnail === 'string' && e.thumbnail)
            ?.thumbnail ?? '';

        return {
          seasonNumber,
          episodeCount: eps.length,
          thumbnail: firstThumb || series.thumbnail,
        };
      })
      .sort((a, b) => a.seasonNumber - b.seasonNumber);
  }

  private safeDecodeURIComponent(value: string) {
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
}
