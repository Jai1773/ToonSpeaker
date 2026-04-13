import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, ViewChild, inject } from '@angular/core';
import { Hero } from "../../components/hero/hero";
import { SeriesCard } from "../../components/series-card/series-card";
import { SeriesListItem, VideoService } from '../../services/video.service';
import { Observable, map } from 'rxjs';
import { RouterLink } from '@angular/router';

type BrowseType = 'cartoons' | 'anime' | 'movies';
type CategoryTone = 'cartoons' | 'anime' | 'movies';

type HomeCategory = {
  slug: BrowseType;
  tone: CategoryTone;
  label: string;
  subtitle: string;
  count: number;
};

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
  imports: [CommonModule, SeriesCard, Hero, RouterLink]
})
export class Home implements AfterViewInit {
  private readonly videoService = inject(VideoService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('trendingRow') private trendingRow?: ElementRef<HTMLElement>;
  @ViewChild('popularRow') private popularRow?: ElementRef<HTMLElement>;

  trendingScrollable = false;
  popularScrollable = false;

  readonly series$: Observable<SeriesListItem[]> = this.videoService.getSeriesList();
  readonly trending$: Observable<SeriesListItem[]> = this.series$;
  readonly popular$: Observable<SeriesListItem[]> = this.series$;
  readonly categories$: Observable<HomeCategory[]> = this.series$.pipe(
    map((series) => {
      const counts = series.reduce<Record<string, number>>((acc, s) => {
        acc[s.type] = (acc[s.type] ?? 0) + 1;
        return acc;
      }, {});

      const cartoonCount = counts['cartoon'] ?? 0;
      const animeCount = counts['anime'] ?? 0;
      const movieCount = counts['movie'] ?? 0;

      const items: HomeCategory[] = [
        {
          slug: 'cartoons',
          tone: 'cartoons',
          label: 'Cartoons',
          subtitle: 'Comedy, action, classics',
          count: cartoonCount,
        },
        {
          slug: 'anime',
          tone: 'anime',
          label: 'Anime',
          subtitle: 'New seasons and hits',
          count: animeCount,
        },
        {
          slug: 'movies',
          tone: 'movies',
          label: 'Movies',
          subtitle: 'Short picks, big stories',
          count: movieCount,
        },
      ];

      return items;
    }),
  );

  ngAfterViewInit() {
    // Recompute once after initial render and again after data arrives.
    this.recomputeScrollability();

    const sub = this.series$.subscribe(() => {
      // Let Angular render the cards before measuring scrollWidth.
      setTimeout(() => this.recomputeScrollability(), 0);
    });

    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.recomputeScrollability();
  }

  scrollLeft(el: any) {
    const container = el instanceof HTMLElement ? el : el.nativeElement;

    container.scrollBy({
      left: -container.clientWidth,
      behavior: 'smooth'
    });
  }

  scrollRight(el: any) {
    const container = el instanceof HTMLElement ? el : el.nativeElement;

    container.scrollBy({
      left: container.clientWidth,
      behavior: 'smooth'
    });
  }

  private recomputeScrollability() {
    this.trendingScrollable = this.isScrollable(this.trendingRow?.nativeElement);
    this.popularScrollable = this.isScrollable(this.popularRow?.nativeElement);
  }

  private isScrollable(el?: HTMLElement) {
    if (!el) return false;
    return el.scrollWidth - el.clientWidth > 4;
  }
}
