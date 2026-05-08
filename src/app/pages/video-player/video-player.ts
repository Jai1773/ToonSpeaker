import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';

type VideoStream = {
  url: string;
  quality?: number;
  audio?: string;
};

type PlayerVideo = {
  id: number;
  title: string;
  videoUrl: string;
  streams?: VideoStream[];
};

@Component({
  selector: 'app-video-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-player.html',
  styleUrls: ['./video-player.scss'],
})
export class VideoPlayer implements OnInit {

  video: PlayerVideo | null = null;
  safeUrl: SafeResourceUrl | null = null;

  videos = [
    {
      id: 1,
      title: 'Episode 1',
      videoUrl: 'https://short.icu/Etm1vby8c',
      streams: [
        { quality: 360, audio: 'English', url: 'https://short.icu/Etm1vby8c' },
        { quality: 720, audio: 'English', url: 'https://short.icu/Etm1vby8c' },
        { quality: 1080, audio: 'English', url: 'https://short.icu/Etm1vby8c' },
        { quality: 360, audio: 'Tamil', url: 'https://short.icu/Etm1vby8c' },
        { quality: 720, audio: 'Tamil', url: 'https://short.icu/Etm1vby8c' },
      ],
    },
    {
      id: 2,
      title: 'Episode 2',
      videoUrl: 'https://short.icu/Etm1vby8c',
      streams: [
        { quality: 360, audio: 'English', url: 'https://short.icu/Etm1vby8c' },
        { quality: 720, audio: 'English', url: 'https://short.icu/Etm1vby8c' },
        { quality: 1080, audio: 'English', url: 'https://short.icu/Etm1vby8c' },
        { quality: 360, audio: 'Tamil', url: 'https://short.icu/Etm1vby8c' },
        { quality: 720, audio: 'Tamil', url: 'https://short.icu/Etm1vby8c' },
      ],
    },
  ] satisfies PlayerVideo[];

  availableQualities: number[] = [];
  availableAudios: string[] = [];
  selectedQuality: number | null = null;
  selectedAudio = '';
  private normalizedStreams: VideoStream[] = [];

  private readonly allowedIframeHosts = new Set([
    'short.icu',
    'www.youtube.com',
    'youtube.com',
    'player.vimeo.com',
  ]);

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {

      const id = Number(params['id']);

      this.video = this.videos.find(v => v.id === id) ?? null;

      if (!this.video) {
        this.safeUrl = null;
        this.availableAudios = [];
        this.availableQualities = [];
        this.selectedAudio = '';
        this.selectedQuality = null;
        this.normalizedStreams = [];
        return;
      }

      this.setPlaybackOptions(this.video);
      this.injectJsonLd();
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

  nextVideo() {
    if (!this.video) return;

    const nextId = this.video.id + 1;

    if (this.videos.find(v => v.id === nextId)) {
      this.router.navigate(['/watch', nextId]);
    }
  }

  prevVideo() {
    if (!this.video) return;

    const prevId = this.video.id - 1;

    if (this.videos.find(v => v.id === prevId)) {
      this.router.navigate(['/watch', prevId]);
    }
  }

  private setPlaybackOptions(video: PlayerVideo) {
    this.safeUrl = null;
    this.availableQualities = [];
    this.availableAudios = [];
    this.selectedQuality = null;
    this.selectedAudio = '';
    this.normalizedStreams = [];

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
      this.safeUrl = null;
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
    this.safeUrl = this.toSafeResourceUrl(url);
    this.injectJsonLd();
  }

  private buildVideoJsonLd() {
    if (!this.video) return null;

    const id = this.video.id;
    const pageUrl = `https://toon-speaker.vercel.app/watch/${id}`;
    const embedUrl = (this.normalizedStreams && this.normalizedStreams[0] && this.normalizedStreams[0].url) || this.video.videoUrl;

    const json: any = {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      "name": this.video.title,
      "description": this.video.title,
      "thumbnailUrl": "https://toon-speaker.vercel.app/assets/thambnails/mainLogo/mainLogo.png",
      "embedUrl": embedUrl,
      "url": pageUrl
    };

    return json;
  }

  private injectJsonLd() {
    if (typeof document === 'undefined') return;

    try {
      const existing = document.getElementById('video-jsonld');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      const json = this.buildVideoJsonLd();
      if (!json) return;

      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.id = 'video-jsonld';
      s.text = JSON.stringify(json);
      document.head.appendChild(s);
    } catch (e) {
      // ignore DOM errors (e.g., during some server-side renders)
    }
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
}
