import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '',
    renderMode: RenderMode.Prerender
  },
  {
    path: 'type/:type',
    renderMode: RenderMode.Server
  },
  {
    path: 'watch/:id',
    renderMode: RenderMode.Client
  },
  {
    path: 'series/:name/season/:season',
    renderMode: RenderMode.Client
  },
  {
    path: 'series/:name/movie/:videoId',
    renderMode: RenderMode.Client
  },
  {
    path: 'series/:name',
    renderMode: RenderMode.Server
  },
  {
    path: 'search',
    renderMode: RenderMode.Server
  }
];
