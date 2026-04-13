import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  SeriesVideoStream,
  SeriesVideoWithSeries,
  VideoService,
} from '../../services/video.service';
import { map, switchMap, tap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';

@Component({
  selector: 'app-season',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './season.html',
  styleUrls: ['./season.scss'],
})
export class SeasonPage {
  private route = inject(ActivatedRoute);
  private videoService = inject(VideoService);
  private sanitizer = inject(DomSanitizer);

  vm$: Observable<any>;

  constructor() {
    this.vm$ = this.route.paramMap.pipe(
      map((params) => ({
        name: params.get('name') ?? '',
        season: Number(params.get('season') ?? '1'),
      })),
      switchMap(({ name, season }) =>
        this.videoService.getSeriesByName(name).pipe(
          switchMap((series) => {
            if (!series) return of(null);

            return this.videoService.getVideosBySeries(series.file).pipe(
              map((videos) => {
                const episodes = videos
                  .filter((v) => v.seasonNumber === season)
                  .sort(
                    (a, b) =>
                      a.episodeNumber - b.episodeNumber
                  );

                return { seriesInfo: series, episodes };
              }),
              tap((res) => {
                if (!res?.episodes?.length) return;

                const seriesFile = res.seriesInfo?.file || '';
                const prefs = seriesFile ? this.loadPrefs(seriesFile) : null;

                if (prefs && prefs.lastWatchedEpisodeId) {
                  const found = res.episodes.find((e: any) => e.id === prefs.lastWatchedEpisodeId);
                  if (found) {
                    this.selectEpisode(found);
                    return;
                  }
                }

                this.selectEpisode(res.episodes[0]);
              })
            );
          })
        )
      )
    );
  }

  // 🎬 PLAYER STATE
  currentVideo: SeriesVideoWithSeries | null = null;
  safeVideoUrl: SafeResourceUrl | null = null;

  servers: { id: string; label: string; streams: SeriesVideoStream[] }[] = [];
  selectedServerIndex = 0;
  selectedServerId: string = '';

  availableAudios: string[] = [];
  selectedAudio: string = '';

  // 🎯 SELECT EPISODE
  selectEpisode(video: SeriesVideoWithSeries) {
    this.currentVideo = video;
    this.setPlaybackOptions(video);
    // persist last-watched episode and current playback prefs
    const seriesFile = video.seriesFile || '';
    if (seriesFile) {
      this.savePrefs(seriesFile, {
        lastWatchedEpisodeId: video.id,
        selectedServerId: this.selectedServerId,
        selectedAudio: this.selectedAudio,
      });
    }
  }

  // 🔥 MAIN FIXED LOGIC
  private setPlaybackOptions(video: SeriesVideoWithSeries) {
    if (!video) return;

    const streams =
      Array.isArray(video.streams) && video.streams.length
        ? video.streams
        : [{ url: video.videoUrl }];

    // ✅ GROUP BY SERVER ID when any stream provides it; otherwise group by hostname
    const serverMap = new Map<string, SeriesVideoStream[]>();
    const hasServerField = streams.some((s) => {
      const raw = (s as any).server ?? (s as any).serverId;
      return raw !== undefined && raw !== null && String(raw).trim() !== '';
    });

    for (const s of streams) {
      let serverKey: string;
      if (hasServerField) {
        serverKey = String((s as any).server ?? (s as any).serverId ?? 'unknown').trim() || 'unknown';
      } else {
        try {
          const url = new URL((s as any).url || '');
          serverKey = url.hostname || url.host || 'unknown';
        } catch {
          serverKey = 'unknown';
        }
      }

      if (!serverMap.has(serverKey)) serverMap.set(serverKey, []);
      serverMap.get(serverKey)!.push(s as SeriesVideoStream);
    }

    // ✅ BUILD SERVER LIST
    if (hasServerField) {
      // keys are numeric server ids -> label as `Server N`
      this.servers = Array.from(serverMap.entries()).map(([id, list]) => ({ id, label: `Server ${id}`, streams: list }));
    } else {
      // keys are hostnames; label them sequentially as Server 1, Server 2...
      this.servers = Array.from(serverMap.values()).map((list, i) => ({ id: String(i + 1), label: `Server ${i + 1}`, streams: list }));
    }

    // ✅ SET DEFAULT SERVER (IMPORTANT FOR YOUR HTML)
    this.selectedServerIndex = 0;
    this.selectedServerId = this.servers[0]?.id || '';

    // Apply saved prefs for this series (server/audio) if available
    const seriesFile = video.seriesFile || '';
    const prefs = seriesFile ? this.loadPrefs(seriesFile) : null;

    // build audios for the (possibly updated) selected server
    this.updateAudios();

    if (prefs) {
      if (prefs.selectedServerId) {
        const idx = this.servers.findIndex((s) => s.id === prefs.selectedServerId);
        if (idx >= 0) {
          this.selectedServerIndex = idx;
          this.selectedServerId = this.servers[idx].id;
          // rebuild audios for the chosen server
          this.updateAudios();
        }
      }

      if (prefs.selectedAudio) {
        const found = this.availableAudios.find((a) => a.toLowerCase() === (prefs.selectedAudio || '').toLowerCase());
        if (found) this.selectedAudio = found;
      }
    }

    this.updateVideo();
  }

  // 🎧 AUDIO HANDLING
  private updateAudios() {
    const server = this.servers[this.selectedServerIndex];
    if (!server) return;

    const audioSet = new Set<string>();

    for (const s of server.streams) {
      const audio = (s as any).audio || 'Unknown';
      audioSet.add(audio);
    }

    this.availableAudios = Array.from(audioSet);

    // default Tamil if exists
    this.selectedAudio =
      this.availableAudios.find(
        (a) => a.toLowerCase() === 'tamil'
      ) || this.availableAudios[0];
  }

  // 🎥 VIDEO UPDATE
  private updateVideo() {
    const server = this.servers[this.selectedServerIndex];
    if (!server) return;

    const stream =
      server.streams.find(
        (s) =>
          (s as any).audio?.toLowerCase() ===
          this.selectedAudio.toLowerCase()
      ) || server.streams[0];

    this.safeVideoUrl = this.sanitize(stream.url);
  }

  // 🔁 SERVER CHANGE
  onServerSelect(event: Event) {
    const val = (event.target as HTMLSelectElement).value;

    const index = this.servers.findIndex((s) => s.id === val);

    if (index !== -1) {
      this.selectedServerIndex = index;

      // ✅ REQUIRED for your HTML
      this.selectedServerId = this.servers[index].id;

      this.updateAudios();
      this.updateVideo();
      // persist server selection for current series
      if (this.currentVideo?.seriesFile) {
        this.savePrefs(this.currentVideo.seriesFile, { selectedServerId: this.selectedServerId, selectedAudio: this.selectedAudio });
      }
    }
  }

  // 🔁 AUDIO CHANGE
  onAudioChange(event: Event) {
    this.selectedAudio = (event.target as HTMLSelectElement).value;
    this.updateVideo();
    if (this.currentVideo?.seriesFile) {
      this.savePrefs(this.currentVideo.seriesFile, { selectedAudio: this.selectedAudio });
    }
  }

  // --- Preferences helpers (per-series) ---
  private prefsKeyForSeries(seriesFile: string) {
    return `player:series:${seriesFile}`;
  }

  private loadPrefs(seriesFile: string): { selectedServerId?: string; selectedAudio?: string; lastWatchedEpisodeId?: number } | null {
    if (!seriesFile) return null;
    try {
      const raw = localStorage.getItem(this.prefsKeyForSeries(seriesFile));
      if (!raw) return null;
      return JSON.parse(raw) as { selectedServerId?: string; selectedAudio?: string; lastWatchedEpisodeId?: number };
    } catch {
      return null;
    }
  }

  private savePrefs(seriesFile: string, data: { selectedServerId?: string; selectedAudio?: string; lastWatchedEpisodeId?: number }) {
    if (!seriesFile) return;
    try {
      const cur = this.loadPrefs(seriesFile) || {};
      const merged = { ...cur, ...data };
      localStorage.setItem(this.prefsKeyForSeries(seriesFile), JSON.stringify(merged));
    } catch {
      // ignore
    }
  }

  // 🔒 SAFE URL
  private sanitize(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  // 🖼️ IMAGE FALLBACK
  fallbackThumbnail = '/assets/thambnails/placeholder.svg';

  onImgError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.src = this.fallbackThumbnail;
  }
}
