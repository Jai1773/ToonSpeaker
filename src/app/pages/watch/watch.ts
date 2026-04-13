import { Component, DestroyRef, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { VideoCard } from '../../components/video-card/video-card';
import { SeriesVideoStream, SeriesVideoWithSeries, VideoService } from '../../services/video.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { combineLatest, map, of, shareReplay, Subscription, switchMap } from 'rxjs';

@Component({
  selector: 'app-watch',
  standalone: true,
  imports: [CommonModule, VideoCard],
  templateUrl: './watch.html',
  styleUrls: ['./watch.scss'],
})
export class Watch {

  private readonly destroyRef = inject(DestroyRef);

  video: SeriesVideoWithSeries | null = null;
  relatedVideos: SeriesVideoWithSeries[] = [];
  safeVideoUrl: SafeResourceUrl | null = null;
  emptyMessage = 'Loading...';

  availableQualities: number[] = [];
  availableAudios: string[] = [];
  selectedQuality: number | null = null;
  selectedAudio = '';
  private normalizedStreams: SeriesVideoStream[] = [];
  private routeSub: Subscription | null = null;
  private videoSub: Subscription | null = null;
  private relatedSub: Subscription | null = null;

  private readonly allowedIframeHosts = new Set([
    'short.icu',
    'www.youtube.com',
    'youtube.com',
    'player.vimeo.com',
  ]);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private videoService: VideoService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit() {
    this.routeSub = combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(
      ([params, qParams]) => {
        const id = Number(params.get('id') ?? qParams.get('id') ?? '');
        const navState = (this.router.getCurrentNavigation()?.extras.state ?? null) as
          | { series?: unknown; file?: unknown; seriesFile?: unknown }
          | null;
        const historyState =
          typeof history !== 'undefined'
            ? (history.state as { series?: unknown; file?: unknown; seriesFile?: unknown } | null)
            : null;
        const stateSeriesRaw = (navState?.seriesFile ?? navState?.series ?? navState?.file ?? historyState?.seriesFile ?? historyState?.series ?? historyState?.file ?? '')
          .toString()
          .trim();

        const seriesFileRaw = (
          qParams.get('series') ??
          qParams.get('file') ??
          qParams.get('seriesFile') ??
          stateSeriesRaw ??
          ''
        ).trim();
        const seriesNameRaw = (qParams.get('name') ?? qParams.get('seriesName') ?? '').trim();
        const seriesName = this.safeDecodeURIComponent(seriesNameRaw);

        this.video = null;
        this.relatedVideos = [];
        this.safeVideoUrl = null;
        this.availableQualities = [];
        this.availableAudios = [];
        this.selectedQuality = null;
        this.selectedAudio = '';
        this.normalizedStreams = [];
        this.emptyMessage = 'Loading...';

        if (!Number.isFinite(id) || id <= 0) {
          this.emptyMessage = 'Invalid video URL.';
          return;
        }

        if (this.videoSub) this.videoSub.unsubscribe();
        if (this.relatedSub) this.relatedSub.unsubscribe();

        // If the URL already tells us the series, resolve it and load by id.
        // Otherwise, fall back to scanning all series so `/watch/:id` works as a deep link.
        if (!seriesFileRaw && !seriesName) {
          const remembered = this.getRememberedSeriesFile();

          const resolve$ = remembered
            ? this.videoService.getVideoById(remembered, id).pipe(
                switchMap((video) => (video ? of({ ...video, seriesFile: remembered }) : this.videoService.findVideoByIdAcrossSeries(id))),
              )
            : this.videoService.findVideoByIdAcrossSeries(id);

          this.videoSub = resolve$.subscribe((video) => {
            this.video = video;
            if (!video) {
              this.emptyMessage = 'Video not found.';
              this.setPlaybackOptions(null);
              return;
            }

            this.rememberSeriesFile(video.seriesFile);
            this.ensureCanonicalSeriesQuery(video.seriesFile);
            this.setPlaybackOptions(video);

            if (this.relatedSub) this.relatedSub.unsubscribe();
            this.relatedSub = this.videoService
              .getRelatedVideos(video.seriesFile, id, 24)
              .subscribe((videos) => (this.relatedVideos = videos));
          });
          return;
        }

        const resolveFile$ = seriesFileRaw
          ? of(this.normalizeSeriesFile(seriesFileRaw))
          : this.videoService.getSeriesByName(seriesName).pipe(map((s) => s?.file ?? null));

        const seriesFile$ = resolveFile$.pipe(shareReplay({ bufferSize: 1, refCount: false }));

        this.videoSub = seriesFile$
          .pipe(
            switchMap((file) => {
              if (!file) {
                this.emptyMessage = 'Series not found.';
                return of(null);
              }
              return this.videoService.getVideoById(file, id);
            }),
          )
          .subscribe((video) => {
            this.video = video;
            if (!video) {
              // If the series resolved but the video didn't, show a stable message.
              if (seriesFileRaw || seriesName) this.emptyMessage = 'Video not found.';
              this.setPlaybackOptions(null);
              return;
            }
            this.rememberSeriesFile(video.seriesFile);
            this.ensureCanonicalSeriesQuery(video.seriesFile);
            this.setPlaybackOptions(video);
          });

        this.relatedSub = seriesFile$
          .pipe(switchMap((file) => (file ? this.videoService.getRelatedVideos(file, id, 24) : of([]))))
          .subscribe((videos) => (this.relatedVideos = videos));
      },
    );

    this.destroyRef.onDestroy(() => {
      if (this.routeSub) this.routeSub.unsubscribe();
      if (this.videoSub) this.videoSub.unsubscribe();
      if (this.relatedSub) this.relatedSub.unsubscribe();
    });
  }

  onQualityChange(event: Event) {
    const value = (event.target as HTMLSelectElement | null)?.value ?? '';
    const q = Number(value);
    this.selectedQuality = Number.isFinite(q) && q > 0 ? q : null;
    this.updateSafeUrlFromSelection();
  }

  onAudioChange(event: Event) {
    const value = (event.target as HTMLSelectElement | null)?.value ?? '';
    this.selectedAudio = value;
    this.updateSafeUrlFromSelection();
  }

  private setPlaybackOptions(video: SeriesVideoWithSeries | null) {
    this.safeVideoUrl = null;
    this.availableQualities = [];
    this.availableAudios = [];
    this.selectedQuality = null;
    this.selectedAudio = '';
    this.normalizedStreams = [];

    if (!video) return;

    const streams = Array.isArray(video.streams) && video.streams.length ? video.streams : [{ url: video.videoUrl }];
    this.normalizedStreams = streams;

    const qualities = new Set<number>();
    const audios = new Set<string>();

    for (const s of streams) {
      if (typeof s.quality === 'number' && Number.isFinite(s.quality) && s.quality > 0) qualities.add(s.quality);
      if (typeof s.audio === 'string' && s.audio.trim()) audios.add(s.audio.trim());
    }

    this.availableQualities = Array.from(qualities).sort((a, b) => a - b);
    this.availableAudios = Array.from(audios).sort((a, b) => a.localeCompare(b));

    if (this.availableAudios.length) {
      this.selectedAudio = this.availableAudios.includes('English') ? 'English' : this.availableAudios[0];
    }

    if (this.availableQualities.length) {
      this.selectedQuality = this.availableQualities.includes(720)
        ? 720
        : this.availableQualities[this.availableQualities.length - 1];
    }

    this.updateSafeUrlFromSelection();
  }

  private updateSafeUrlFromSelection() {
    if (!this.video) {
      this.safeVideoUrl = null;
      return;
    }

    const streams = this.normalizedStreams.length ? this.normalizedStreams : [{ url: this.video.videoUrl }];

    const audio = this.selectedAudio.trim();
    const quality = this.selectedQuality;

    let candidates = streams;
    if (audio) {
      const byAudio = streams.filter((s) => (s.audio ?? '').trim() === audio);
      if (byAudio.length) candidates = byAudio;
    }

    if (typeof quality === 'number' && Number.isFinite(quality) && quality > 0) {
      const byQuality = candidates.filter((s) => s.quality === quality);
      if (byQuality.length) candidates = byQuality;
    }

    const picked = candidates[0] ?? streams[0];
    const url = picked?.url || this.video.videoUrl;
    this.safeVideoUrl = this.toSafeResourceUrl(url);
  }

  private toSafeResourceUrl(url: unknown): SafeResourceUrl | null {
    if (typeof url !== 'string' || !url) return null;

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return null;
      if (!this.allowedIframeHosts.has(parsed.hostname)) return null;
      return this.sanitizer.bypassSecurityTrustResourceUrl(parsed.toString());
    } catch {
      return null;
    }
  }

  private normalizeSeriesFile(value: string) {
    const trimmed = (value ?? '').trim();
    if (!trimmed) return '';

    // Allow passing full asset paths like `/assets/data/foo.json` or `assets/data/foo.json`.
    const withoutHash = trimmed.split('#')[0] ?? trimmed;
    const withoutQuery = (withoutHash.split('?')[0] ?? withoutHash).trim();
    const parts = withoutQuery.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? withoutQuery;
  }

  private safeDecodeURIComponent(value: string) {
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private rememberSeriesFile(file: string) {
    const f = (file ?? '').trim();
    if (!f) return;
    try {
      sessionStorage.setItem('lastSeriesFile', f);
    } catch {
      // ignore
    }
  }

  private getRememberedSeriesFile() {
    try {
      const v = sessionStorage.getItem('lastSeriesFile');
      return typeof v === 'string' ? v.trim() : '';
    } catch {
      return '';
    }
  }

  private ensureCanonicalSeriesQuery(seriesFile: string) {
    const file = this.normalizeSeriesFile(seriesFile);
    if (!file) return;

    const current = this.normalizeSeriesFile(this.route.snapshot.queryParamMap.get('series') ?? '');
    if (current === file) return;

    this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParamsHandling: 'merge',
      queryParams: { series: file },
    });
  }
}
