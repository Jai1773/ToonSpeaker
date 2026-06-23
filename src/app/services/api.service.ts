import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';

export interface ApiSeriesListItem {
  id: string;
  name: string;
  thumbnail: string;
  type: 'cartoon' | 'anime' | 'movie';
}

export interface ApiSeriesVideo {
  id: number;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  videoUrl: string;
  streams: Array<{ server: string; url: string }>;
  thumbnail: string;
  description: string;
}

export interface ApiResponse<T> {
  success: boolean;
  key: string;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://backend.bjagan092004.workers.dev/api';

  getDashboard(): Observable<ApiSeriesListItem[]> {
    return this.http.get<ApiResponse<ApiSeriesListItem[]>>(`${this.baseUrl}/dashboard`).pipe(
      map((res) => (res.success ? res.data : [])),
      catchError(() => of([])),
    );
  }

  getSeries(id: string): Observable<ApiSeriesVideo[]> {
    // Requesting series data for id (internal)
    return this.http.get<any>(`${this.baseUrl}/series/${id}`).pipe(
      map((res) => {
        if (res && typeof res === 'object' && 'success' in res) {
          // API returned success flag; continue accordingly
          return res.success ? res.data : [];
        }
        if (Array.isArray(res)) {
          return res;
        }
        // Unexpected response format for id
        return [];
      }),
      catchError(() => of([])),
      map((videos) => this.mapToApiVideos(videos))
    );
  }

  private mapToApiVideos(videos: any[]): ApiSeriesVideo[] {
    return videos.map(v => ({
      id: v.id,
      title: v.title,
      seasonNumber: v.seasonNumber,
      episodeNumber: v.episodeNumber,
      videoUrl: v.videoUrl,
      thumbnail: v.thumbnail,
      description: v.description || '',
      streams: (v.streams || []).map((s: any) => ({ server: s.server || 'unknown', url: s.url }))
    }));
  }
}
