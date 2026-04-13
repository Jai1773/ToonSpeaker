import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { SeriesListItem } from '../../services/video.service';

@Component({
  selector: 'app-series-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './series-card.html',
  styleUrl: './series-card.scss',
})
export class SeriesCard {
  @Input({ required: true }) series!: SeriesListItem;

  protected readonly fallbackThumbnail = '/assets/thambnails/placeholder.svg';

  constructor(private router: Router) {}

  openSeries() {
    const name = this.series?.name?.trim();
    if (!name) return;
    this.router.navigate(['/series', name]);
  }

  onImgError(event: Event) {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;
    if (img.src.includes(this.fallbackThumbnail)) return;
    img.src = this.fallbackThumbnail;
  }
}
