import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, Inject, PLATFORM_ID, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SeriesCard } from '../../components/series-card/series-card';
import { SeriesListItem, VideoService } from '../../services/video.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, SeriesCard],
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
        if (this.resultsSub) this.resultsSub.unsubscribe();
        this.redirectIfEmptyQuery();
        return;
      }

      if (this.resultsSub) this.resultsSub.unsubscribe();
      this.resultsSub = this.videoService.searchSeries(q, 24).subscribe((items) => {
        const cartoons = items.filter((s) => s.type === 'cartoon');
        const anime = items.filter((s) => s.type === 'anime');
        const movies = items.filter((s) => s.type === 'movie');

        this.sections = [
          { title: 'Cartoons', items: cartoons },
          { title: 'Anime', items: anime },
          { title: 'Movies', items: movies },
        ].filter((section) => section.items.length);
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
}
