import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { SeriesVideoWithSeries } from '../../services/video.service';

@Component({
  selector: 'app-video-card',
  imports: [CommonModule],
  templateUrl: './video-card.html',
  styleUrl: './video-card.scss',
})
export class VideoCard {
  @Input({ required: true }) video!: SeriesVideoWithSeries;
  @Output() cardClick = new EventEmitter<SeriesVideoWithSeries>();

  constructor(private router: Router) {}

  openVideo() {
    if (this.cardClick.observed) {
      this.cardClick.emit(this.video);
      return;
    }

    const id = this.video?.id;
    const seriesFile = this.video?.seriesFile;
    if (typeof id !== 'number' || !Number.isFinite(id)) return;
    if (typeof seriesFile !== 'string' || !seriesFile.trim()) return;

    this.router.navigate(['/watch', id], { queryParams: { series: seriesFile } });
  }

  protected readonly fallbackThumbnail = '/assets/thambnails/placeholder.svg';

  onImgError(event: Event) {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;

    if (img.src.includes(this.fallbackThumbnail)) return;
    img.src = this.fallbackThumbnail;
  }
}
