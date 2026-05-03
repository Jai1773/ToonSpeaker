import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, Inject, PLATFORM_ID, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SeriesCard } from '../../components/series-card/series-card';
import { MovieSearchResult, SeriesListItem, VideoService } from '../../services/video.service';
import { Subscription, combineLatest } from 'rxjs';
import { VideoCard } from '../../components/video-card/video-card';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, SeriesCard, VideoCard],
  templateUrl: './search.html',
  styleUrls: ['./search.scss'],
})
export class Search {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly videoService = inject(VideoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly lastNonSearchUrlKey = 'toonSpeaker:lastNonSearchUrl';

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  query = '';
  sections: Array<{ title: string; items: SeriesListItem[] }> = [];
  movieResults: MovieSearchResult[] = [];
  private resultsSub: Subscription | null = null;

  ngOnInit() {
    const sub = this.route.queryParamMap.subscribe((params) => {
      const series = (params.get('series') ?? '').trim();
      const q = (params.get('q') ?? '').trim();

      this.query = q;

      if (series) {
        this.router.navigate(['/series', series], { replaceUrl: true });
        return;
      }

      if (!q) {
        this.sections = [];
        this.movieResults = [];
        if (this.resultsSub) this.resultsSub.unsubscribe();
        this.redirectIfEmptyQuery();
        return;
      }

      if (this.resultsSub) this.resultsSub.unsubscribe();
      this.resultsSub = combineLatest([
        this.videoService.searchSeries(q, 24),
        this.videoService.searchMovieVideos(q, 18),
      ]).subscribe(([items, movieResults]) => {
        const cartoons = items.filter((s) => s.type === 'cartoon');
        const anime = items.filter((s) => s.type === 'anime');
        const movies = items.filter((s) => s.type === 'movie');

        this.sections = [
          { title: 'Cartoons', items: cartoons },
          { title: 'Anime', items: anime },
          { title: 'Movie Series', items: movies },
        ].filter((section) => section.items.length);

        this.movieResults = movieResults;
      });
    });

    this.destroyRef.onDestroy(() => {
      sub.unsubscribe();
      if (this.resultsSub) this.resultsSub.unsubscribe();
    });
  }

  private redirectIfEmptyQuery() {
    if (!isPlatformBrowser(this.platformId)) return;

    let target = '/';
    try {
      const saved = sessionStorage.getItem(this.lastNonSearchUrlKey);
      if (saved && !saved.startsWith('/search')) target = saved;
    } catch {}

    this.router.navigateByUrl(target, { replaceUrl: true });
  }

  openMovie(video: MovieSearchResult) {
    const slug = (video.seriesFile || '').replace(/\.json$/i, '');
    if (!slug || !video?.id) return;
    this.router.navigate(['/series', slug, 'movie', video.id]);
  }
}
