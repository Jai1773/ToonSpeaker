import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, Inject, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SeriesListItem, VideoService } from '../../services/video.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  menuOpen = false;
  searchText: string = '';
  scrolled = false;
  showSuggestions = false;
  suggestedSeries: SeriesListItem[] = [];
  searchFocused = false;
  private suggestTimer: ReturnType<typeof setTimeout> | null = null;
  private navigateTimer: ReturnType<typeof setTimeout> | null = null;
  private suggestSub: Subscription | null = null;
  private lastNonSearchUrl = '/';
  private readonly lastNonSearchUrlKey = 'toonSpeaker:lastNonSearchUrl';

  constructor(
    private router: Router,
    private videoService: VideoService,
    private elRef: ElementRef<HTMLElement>,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit(): void {
    this.updateScrolledState();
    this.syncSearchFromUrl();
    this.loadLastNonSearchUrl();

    const sub = this.router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;

      if (!event.urlAfterRedirects.startsWith('/search')) {
        this.setLastNonSearchUrl(event.urlAfterRedirects);
      }

      if (
        event.urlAfterRedirects.startsWith('/watch/') ||
        event.urlAfterRedirects.startsWith('/series/')
      ) {
        this.searchText = '';
        this.closeSuggestions();
        return;
      }

      if (event.urlAfterRedirects.startsWith('/search')) {
        if (!this.searchFocused) this.syncSearchFromUrl();
      }

      // Close mobile menu on type browsing navigation.
      if (event.urlAfterRedirects.startsWith('/type/')) {
        this.menuOpen = false;
      }
    });

    this.destroyRef.onDestroy(() => {
      sub.unsubscribe();
      if (this.suggestTimer) clearTimeout(this.suggestTimer);
      if (this.navigateTimer) clearTimeout(this.navigateTimer);
      if (this.suggestSub) this.suggestSub.unsubscribe();
    });
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    this.updateScrolledState();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as Node | null;
    if (!target) return;
    if (!this.elRef.nativeElement.contains(target)) this.closeSuggestions();
  }

  private updateScrolledState() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.scrolled = (window.scrollY ?? 0) > 8;
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  onSearch() {
    const query = this.searchText.trim();

    if (!query) return;

    console.log('Searching:', query);

    this.captureLastNonSearchBeforeSearch();
    this.router.navigate(['/search'], {
      queryParams: { q: query }
    });

    this.menuOpen = false;
    this.closeSuggestions();
  }

  onSearchInput() {
    if (this.suggestTimer) clearTimeout(this.suggestTimer);
    if (this.navigateTimer) clearTimeout(this.navigateTimer);

    const query = this.searchText.trim();
    if (!query) {
      this.suggestedSeries = [];
      this.showSuggestions = false;

      if (this.router.url.startsWith('/search')) this.navigateBackFromSearch();
      return;
    }

    this.showSuggestions = true;

    this.suggestTimer = setTimeout(() => this.updateSuggestions(), 120);
    // Only live-navigate while already on the search page. This prevents
    // interrupting playback (e.g. /watch) just because the user typed a letter.
    if (this.router.url.startsWith('/search')) {
      this.navigateTimer = setTimeout(() => this.navigateToQuery(query), 180);
    }
  }

  onSearchFocus() {
    this.searchFocused = true;
  }

  onSearchBlur() {
    setTimeout(() => {
      this.searchFocused = false;
    }, 150);
  }

  openSuggestions() {
    if (!this.searchText.trim()) return;
    this.updateSuggestions();
    this.showSuggestions = true;
  }

  closeSuggestions() {
    this.showSuggestions = false;
  }

  private updateSuggestions() {
    const query = this.searchText.trim();
    if (!query) return;

    if (this.suggestSub) this.suggestSub.unsubscribe();
    this.suggestSub = this.videoService.searchSeries(query, 6).subscribe((items) => {
      this.suggestedSeries = items;
    });
  }

  private navigateToQuery(query: string) {
    const q = query.trim();
    if (!q) return;

    this.captureLastNonSearchBeforeSearch();
    this.router.navigate(['/search'], {
      queryParams: { q },
      replaceUrl: true,
    });
  }

  private syncSearchFromUrl() {
    const tree = this.router.parseUrl(this.router.url);
    const series = typeof tree.queryParams?.['series'] === 'string' ? tree.queryParams['series'] : '';
    const q = typeof tree.queryParams?.['q'] === 'string' ? tree.queryParams['q'] : '';
    this.searchText = ((series || q) ?? '').trim();
  }

  private captureLastNonSearchBeforeSearch() {
    if (!isPlatformBrowser(this.platformId)) return;
    const current = this.router.url;
    if (!current.startsWith('/search')) this.setLastNonSearchUrl(current);
  }

  private setLastNonSearchUrl(url: string) {
    if (!url || url.startsWith('/search')) return;
    this.lastNonSearchUrl = url;

    try {
      sessionStorage.setItem(this.lastNonSearchUrlKey, url);
    } catch {}
  }

  private loadLastNonSearchUrl() {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const saved = sessionStorage.getItem(this.lastNonSearchUrlKey);
      if (saved && !saved.startsWith('/search')) this.lastNonSearchUrl = saved;
    } catch {}
  }

  private navigateBackFromSearch() {
    const target = this.lastNonSearchUrl && !this.lastNonSearchUrl.startsWith('/search')
      ? this.lastNonSearchUrl
      : '/';

    this.router.navigateByUrl(target, { replaceUrl: true });
  }

  selectSeries(name: string) {
    this.searchText = name;
    this.closeSuggestions();
    this.menuOpen = false;

    this.captureLastNonSearchBeforeSearch();
    this.router.navigate(['/series', name]);
  }
}
