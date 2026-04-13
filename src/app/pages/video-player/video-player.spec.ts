import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { VideoPlayer } from './video-player';

describe('VideoPlayer', () => {
  let component: VideoPlayer;
  let fixture: ComponentFixture<VideoPlayer>;

  beforeEach(async () => {
    const params$ = new BehaviorSubject<Record<string, unknown>>({ id: '999' });

    await TestBed.configureTestingModule({
      imports: [VideoPlayer],
      providers: [
        { provide: ActivatedRoute, useValue: { params: params$.asObservable() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: DomSanitizer, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoPlayer);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
