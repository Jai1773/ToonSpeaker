import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Watch } from './pages/watch/watch';
import { Search } from './pages/search/search';
import { Series } from './pages/series/series';
import { TypePage } from './pages/type/type';
import { SeasonPage } from './pages/season/season';

export const routes: Routes = [
    {
        path: '',
        component: Home
    },
    {
        path: 'type/:type',
        component: TypePage
    },
    {   path: 'watch/:id',
        component: Watch
    },
    {
        path: 'series/:name/season/:season',
        component: SeasonPage
    },
    {
        path: 'series/:name',
        component: Series
    },
    {
        path: 'search',
        component: Search
    },
];
