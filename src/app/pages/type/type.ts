import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SeriesCard } from '../../components/series-card/series-card';
import { SeriesListItem, VideoService } from '../../services/video.service';
import { Observable, map, switchMap } from 'rxjs';

type BrowseType = 'cartoons' | 'anime' | 'movies';
type VideoType = 'cartoon' | 'anime' | 'movie';

@Component({
  selector: 'app-type',
  standalone: true,
  imports: [CommonModule, SeriesCard],
  templateUrl: './type.html',
  styleUrls: ['./type.scss'],
})
export class TypePage {
  private readonly route = inject(ActivatedRoute);
  private readonly videoService = inject(VideoService);

  readonly vm$: Observable<{ heading: string; type: BrowseType; series: SeriesListItem[] }> =
    this.route.paramMap.pipe(
      map((params) => {
        const raw = (params.get('type') ?? '').trim().toLowerCase();
        const type: BrowseType =
          raw === 'anime' ? 'anime' : raw === 'movies' ? 'movies' : 'cartoons';

        const heading =
          type === 'anime' ? 'Anime' : type === 'movies' ? 'Movies' : 'Cartoons';

        const serviceType: VideoType =
          type === 'anime' ? 'anime' : type === 'movies' ? 'movie' : 'cartoon';

        return { heading, type, serviceType };
      }),
      switchMap(({ heading, type, serviceType }) =>
        this.videoService.getSeriesList().pipe(
          map((items) => ({
            heading,
            type,
            series: items.filter((s) => s.type === serviceType),
          })),
        ),
      ),
    );
}
