import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';

import { SeasonPage } from './season';
import { SeriesListItem, SeriesVideoWithSeries, VideoService } from '../../services/video.service';

describe('SeasonPage', () => {
  let component: SeasonPage;
  let fixture: ComponentFixture<SeasonPage>;
  let queryParamMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let routeStub: {
    paramMap: ReturnType<BehaviorSubject<ReturnType<typeof convertToParamMap>>['asObservable']>;
    queryParamMap: ReturnType<BehaviorSubject<ReturnType<typeof convertToParamMap>>['asObservable']>;
    snapshot: { queryParamMap: ReturnType<typeof convertToParamMap> };
  };
  let routerStub: { navigate: ReturnType<typeof vi.fn>; getCurrentNavigation: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  beforeEach(async () => {
    const paramMap$ = new BehaviorSubject(convertToParamMap({ name: 'Ben 10 Omniverse', season: '1' }));
    queryParamMap$ = new BehaviorSubject(convertToParamMap({}));

    routeStub = {
      paramMap: paramMap$.asObservable(),
      queryParamMap: queryParamMap$.asObservable(),
      snapshot: {
        queryParamMap: convertToParamMap({}),
      },
    };

    routerStub = {
      navigate: vi.fn(),
      getCurrentNavigation: vi.fn().mockReturnValue(null),
    };

    const seriesInfo: SeriesListItem = {
      name: 'Ben 10 Omniverse',
      file: 'ben10-omniverse.json',
      thumbnail: '/assets/thambnails/ben1.jpg',
      type: 'cartoon',
    };

    const videos: SeriesVideoWithSeries[] = [
      {
        id: 1,
        title: 'Episode 1',
        seasonNumber: 1,
        episodeNumber: 1,
        videoUrl: 'https://short.icu/Etm1vby8c',
        thumbnail: '/assets/thambnails/ben1.jpg',
        seriesFile: 'ben10-omniverse.json',
      },
    ];

    const videoServiceStub: Pick<VideoService, 'getSeriesByName' | 'getSeriesByFile' | 'getVideosBySeries'> = {
      getSeriesByName: vi.fn().mockReturnValue(of(seriesInfo)),
      getSeriesByFile: vi.fn().mockReturnValue(of(seriesInfo)),
      getVideosBySeries: vi.fn().mockReturnValue(of(videos)),
    };

    await TestBed.configureTestingModule({
      imports: [SeasonPage],
      providers: [
        { provide: ActivatedRoute, useValue: routeStub as Partial<ActivatedRoute> },
        { provide: Router, useValue: routerStub },
        { provide: VideoService, useValue: videoServiceStub },
        { provide: DomSanitizer, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SeasonPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('creates the page', () => {
    expect(component).toBeTruthy();
  });

  it('writes the resolved file into the URL for refresh-safe loading', () => {
    expect(routerStub.navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      replaceUrl: true,
      queryParamsHandling: 'merge',
      queryParams: { file: 'ben10-omniverse.json' },
    });
  });

  it('uses the remembered file on refresh before falling back to name lookup', () => {
    sessionStorage.setItem('season.seriesFile.ben 10 omniverse', 'ben10-omniverse.json');

    const videoService = TestBed.inject(VideoService) as unknown as {
      getSeriesByName: ReturnType<typeof vi.fn>;
      getVideosBySeries: ReturnType<typeof vi.fn>;
    };

    videoService.getSeriesByName.mockClear();
    videoService.getVideosBySeries.mockClear();
    routerStub.navigate.mockClear();
    routeStub.snapshot.queryParamMap = convertToParamMap({});
    queryParamMap$.next(convertToParamMap({}));
    fixture.detectChanges();

    expect(videoService.getSeriesByName).not.toHaveBeenCalled();
    expect(videoService.getVideosBySeries).toHaveBeenCalledWith('ben10-omniverse.json');
    expect(routerStub.navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      replaceUrl: true,
      queryParamsHandling: 'merge',
      queryParams: { file: 'ben10-omniverse.json' },
    });
  });
});
