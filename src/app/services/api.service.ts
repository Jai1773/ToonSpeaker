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
      catchError((err) => {
        console.error('[ApiService] getDashboard failed:', err);
        return of([]);
      })
    );
  }

  getSeries(id: string): Observable<ApiSeriesVideo[]> {
    console.log(`[ApiService] Requesting series data for id: ${id} from ${this.baseUrl}/series/${id}`);
    return this.http.get<any>(`${this.baseUrl}/series/${id}`).pipe(
      map((res) => {
        if (res && typeof res === 'object' && 'success' in res) {
          if (!res.success) {
            console.warn(`[ApiService] API returned success:false for id ${id}. Response:`, res);
          }
          return res.success ? res.data : [];
        }
        if (Array.isArray(res)) {
          return res;
        }
        console.warn(`[ApiService] Unexpected response format for id ${id}:`, res);
        return [];
      }),
      catchError((err) => {
        console.error(`[ApiService] HTTP Error for id ${id}:`, err);
        return of([]);
      }),
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
