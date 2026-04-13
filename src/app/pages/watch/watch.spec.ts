import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';

import { Watch } from './watch';
import { SeriesListItem, VideoService } from '../../services/video.service';

describe('Watch', () => {
  let component: Watch;
  let fixture: ComponentFixture<Watch>;
  let queryParamMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let routerStub: { navigate: ReturnType<typeof vi.fn>; getCurrentNavigation: ReturnType<typeof vi.fn> };
  let routeStub: {
    paramMap: ReturnType<BehaviorSubject<ReturnType<typeof convertToParamMap>>['asObservable']>;
    queryParamMap: ReturnType<BehaviorSubject<ReturnType<typeof convertToParamMap>>['asObservable']>;
    snapshot: { queryParamMap: ReturnType<typeof convertToParamMap> };
  };

  beforeEach(async () => {
    const paramMap$ = new BehaviorSubject(convertToParamMap({ id: '1' }));
    queryParamMap$ = new BehaviorSubject(convertToParamMap({ series: 'ben10-omniverse.json' }));

    routeStub = {
      paramMap: paramMap$.asObservable(),
      queryParamMap: queryParamMap$.asObservable(),
      snapshot: {
        queryParamMap: convertToParamMap({ series: 'ben10-omniverse.json' }),
      },
    };

    routerStub = {
      navigate: vi.fn(),
      getCurrentNavigation: vi.fn().mockReturnValue(null),
    };

    const mockSeries: SeriesListItem = {
      name: 'Ben 10 Omniverse',
      file: 'ben10-omniverse.json',
      thumbnail: '/assets/thambnails/ben1.jpg',
      type: 'cartoon',
    };

    const videoServiceStub: Pick<
      VideoService,
      'getVideoById' | 'getRelatedVideos' | 'getSeriesByName' | 'findVideoByIdAcrossSeries'
    > = {
      // Return `null` so the iframe never renders in tests (avoids SafeResourceUrl runtime checks).
      getVideoById: vi.fn().mockReturnValue(of(null)),
      getRelatedVideos: vi.fn().mockReturnValue(of([])),
      getSeriesByName: vi.fn().mockReturnValue(of(mockSeries)),
      findVideoByIdAcrossSeries: vi.fn().mockReturnValue(of(null)),
    };

    const sanitizerStub: Partial<DomSanitizer> = {};

    await TestBed.configureTestingModule({
      imports: [Watch],
      providers: [
        { provide: ActivatedRoute, useValue: routeStub as Partial<ActivatedRoute> },
        { provide: Router, useValue: routerStub },
        { provide: VideoService, useValue: videoServiceStub },
        { provide: DomSanitizer, useValue: sanitizerStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Watch);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads video when `file` query param is used', () => {
    routeStub.snapshot.queryParamMap = convertToParamMap({ file: 'ben10-omniverse.json' });
    queryParamMap$.next(convertToParamMap({ file: 'ben10-omniverse.json' }));
    fixture.detectChanges();

    const videoService = TestBed.inject(VideoService) as unknown as {
      getVideoById: ReturnType<typeof vi.fn>;
    };

    expect(videoService.getVideoById).toHaveBeenCalledWith('ben10-omniverse.json', 1);
  });

  it('normalizes `series` query param when a full asset path is provided', () => {
    routeStub.snapshot.queryParamMap = convertToParamMap({
      series: '/assets/data/ben10-omniverse.json',
    });
    queryParamMap$.next(convertToParamMap({ series: '/assets/data/ben10-omniverse.json' }));
    fixture.detectChanges();

    const videoService = TestBed.inject(VideoService) as unknown as {
      getVideoById: ReturnType<typeof vi.fn>;
    };

    expect(videoService.getVideoById).toHaveBeenCalledWith('ben10-omniverse.json', 1);
  });

  it('resolves the series file via `name` when no file is provided', () => {
    routeStub.snapshot.queryParamMap = convertToParamMap({ name: 'Ben 10 Omniverse' });
    queryParamMap$.next(convertToParamMap({ name: 'Ben 10 Omniverse' }));
    fixture.detectChanges();

    const videoService = TestBed.inject(VideoService) as unknown as {
      getSeriesByName: ReturnType<typeof vi.fn>;
      getVideoById: ReturnType<typeof vi.fn>;
    };

    expect(videoService.getSeriesByName).toHaveBeenCalledWith('Ben 10 Omniverse');
    expect(videoService.getVideoById).toHaveBeenCalledWith('ben10-omniverse.json', 1);
  });

  it('falls back to scanning all series when no series param is provided', () => {
    routeStub.snapshot.queryParamMap = convertToParamMap({});
    queryParamMap$.next(convertToParamMap({}));
    fixture.detectChanges();

    const videoService = TestBed.inject(VideoService) as unknown as {
      findVideoByIdAcrossSeries: ReturnType<typeof vi.fn>;
    };

    expect(videoService.findVideoByIdAcrossSeries).toHaveBeenCalledWith(1);
  });

  it('writes the resolved series back into the URL for refresh-safe loading', () => {
    routeStub.snapshot.queryParamMap = convertToParamMap({});

    (component as unknown as { ensureCanonicalSeriesQuery: (seriesFile: string) => void })
      .ensureCanonicalSeriesQuery('ben10-omniverse.json');

    expect(routerStub.navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      replaceUrl: true,
      queryParamsHandling: 'merge',
      queryParams: { series: 'ben10-omniverse.json' },
    });
  });
});
