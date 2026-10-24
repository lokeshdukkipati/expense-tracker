import {
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { PreferencesApi } from '../api/preferences.api';
import {
  AccentName,
  DashboardLayout,
  PreferencesPatch,
  ThemeMode,
  UserPreferences,
} from '../models/api.models';
import { AuthService } from './auth.service';

/** Accent colours offered in Settings. The colours themselves live in styles.scss. */
export const ACCENTS: readonly {
  id: AccentName;
  label: string;
  swatch: string;
}[] = [
  { id: 'violet', label: 'Violet', swatch: '#7c6cff' },
  { id: 'ocean', label: 'Ocean', swatch: '#2ea8f5' },
  { id: 'emerald', label: 'Emerald', swatch: '#10b981' },
  { id: 'sunset', label: 'Sunset', swatch: '#f97316' },
  { id: 'rose', label: 'Rose', swatch: '#f43f5e' },
  { id: 'amber', label: 'Amber', swatch: '#f59e0b' },
];

const THEMES: readonly string[] = ['dark', 'light', 'system'];
const ACCENT_IDS: readonly string[] = ACCENTS.map((a) => a.id);
const CACHE_KEY = 'et.prefs';
const LEGACY_THEME_KEY = 'et.theme';
const SAVE_DELAY_MS = 400;
const RETRY_DELAY_MS = 5000;
const MAX_ATTEMPTS = 3;
const MAX_LIST = 200;
const MAX_LAYOUT_ITEMS = 50;

interface Cache {
  /** The user these preferences belong to; null for choices made before anyone signed in. */
  uid: string | null;
  prefs: UserPreferences;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** Keeps only well-formed values, so a stale cache or a hand-edited document can never break the UI. */
function sanitize(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;
  const out: UserPreferences = {};

  const theme = source['theme'];
  if (typeof theme === 'string' && THEMES.includes(theme))
    out.theme = theme as ThemeMode;

  const accent = source['accent'];
  if (typeof accent === 'string' && ACCENT_IDS.includes(accent))
    out.accent = accent as AccentName;

  const reduceMotion = source['reduceMotion'];
  if (typeof reduceMotion === 'boolean') out.reduceMotion = reduceMotion;

  const onboardingDone = source['onboardingDone'];
  if (typeof onboardingDone === 'boolean') out.onboardingDone = onboardingDone;

  const layout = source['dashboardLayout'];
  if (layout && typeof layout === 'object') {
    const { order, hidden } = layout as Record<string, unknown>;
    if (isStringArray(order) && isStringArray(hidden)) {
      out.dashboardLayout = {
        order: order.slice(0, MAX_LAYOUT_ITEMS),
        hidden: hidden.slice(0, MAX_LAYOUT_ITEMS),
      };
    }
  }

  const seenBadges = source['seenBadges'];
  if (isStringArray(seenBadges)) out.seenBadges = seenBadges.slice(0, MAX_LIST);

  const dismissed = source['dismissedDuplicates'];
  if (isStringArray(dismissed))
    out.dismissedDuplicates = dismissed.slice(-MAX_LIST);

  return out;
}

/**
 * The user's look-and-feel settings (theme, accent, motion, dashboard layout, onboarding and badge flags).
 * They are saved on the account, so they follow the user to every device and survive cleared browser storage.
 * A copy in localStorage makes the first paint instant. By default the theme follows the device.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly api = inject(PreferencesApi);
  private readonly auth = inject(AuthService);

  private readonly cache = this.readCache();
  private readonly state = signal<UserPreferences>(this.cache.prefs);

  readonly theme = computed<ThemeMode>(() => this.state().theme ?? 'system');
  readonly accent = computed<AccentName>(() => this.state().accent ?? 'violet');
  readonly reduceMotion = computed(() => this.state().reduceMotion ?? false);
  readonly dashboardLayout = computed<DashboardLayout | null>(
    () => this.state().dashboardLayout ?? null,
  );
  readonly onboardingDone = computed(
    () => this.state().onboardingDone ?? false,
  );
  readonly seenBadges = computed(() => this.state().seenBadges ?? []);
  readonly dismissedDuplicates = computed(
    () => this.state().dismissedDuplicates ?? [],
  );

  /** True once the account's saved preferences have been fetched in this session. */
  readonly synced = signal(false);

  private owner: string | null = this.cache.uid;
  private loadedFor: string | null = null;
  private pending: PreferencesPatch = {};
  private timer?: ReturnType<typeof setTimeout>;
  private attempts = 0;

  constructor() {
    effect(() => {
      const user = this.auth.user();
      untracked(() => (user ? this.load(user.id) : this.onSignedOut()));
    });

    // Closing the tab right after a change should not lose it.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
    window.addEventListener('pagehide', () => this.flush());
  }

  /** Applies a change immediately and saves it to the account shortly after. A null value removes the key. */
  update(patch: PreferencesPatch): void {
    const next: Record<string, unknown> = { ...this.state() };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) delete next[key];
      else next[key] = value;
    }

    this.state.set(sanitize(next));
    this.writeCache();
    this.queue(patch);
  }

  setTheme(theme: ThemeMode): void {
    this.update({ theme });
  }

  setAccent(accent: AccentName): void {
    this.update({ accent });
  }

  setReduceMotion(reduce: boolean): void {
    this.update({ reduceMotion: reduce });
  }

  saveDashboardLayout(layout: DashboardLayout | null): void {
    this.update({ dashboardLayout: layout });
  }

  completeOnboarding(done = true): void {
    this.update({ onboardingDone: done });
  }

  markBadgesSeen(ids: readonly string[]): void {
    const merged = [...new Set([...this.seenBadges(), ...ids])];
    if (merged.length !== this.seenBadges().length)
      this.update({ seenBadges: merged.slice(0, MAX_LIST) });
  }

  dismissDuplicate(key: string): void {
    if (!this.dismissedDuplicates().includes(key)) {
      this.update({
        dismissedDuplicates: [...this.dismissedDuplicates(), key].slice(
          -MAX_LIST,
        ),
      });
    }
  }

  private load(userId: string): void {
    if (this.loadedFor === userId) return;
    this.loadedFor = userId;
    this.synced.set(false);

    // Choices made on this device before signing in, or by this same user, are kept and sent to the account
    // if it has none. Another person's cached choices are dropped.
    const sameOwner = this.owner === null || this.owner === userId;
    const local: UserPreferences = sameOwner ? this.state() : {};
    if (!sameOwner) this.state.set({});

    this.api.get().subscribe({
      next: (server) => {
        const remote = sanitize(server);
        const merged: UserPreferences = { ...local, ...remote }; // the account wins, key by key

        const missingOnServer: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(local)) {
          if ((remote as Record<string, unknown>)[key] === undefined)
            missingOnServer[key] = value;
        }

        this.owner = userId;
        this.state.set(merged);
        this.writeCache();
        this.synced.set(true);

        if (Object.keys(missingOnServer).length > 0)
          this.queue(sanitize(missingOnServer));
      },
      error: () => {
        // Keep working with what is on this device; the next page load tries again.
        this.loadedFor = null;
      },
    });
  }

  private onSignedOut(): void {
    this.loadedFor = null;
    this.synced.set(false);
    this.pending = {};
    clearTimeout(this.timer);
  }

  private queue(patch: PreferencesPatch): void {
    this.pending = { ...this.pending, ...patch };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  private flush(): void {
    clearTimeout(this.timer);
    if (!this.auth.isAuthenticated() || Object.keys(this.pending).length === 0)
      return;

    const body = this.pending;
    this.pending = {};

    this.api.patch(body).subscribe({
      next: () => {
        this.attempts = 0;
      },
      error: () => {
        // Keep what could not be saved (newer changes win) and retry shortly, a few times at most.
        this.pending = { ...body, ...this.pending };
        if (++this.attempts < MAX_ATTEMPTS)
          this.timer = setTimeout(() => this.flush(), RETRY_DELAY_MS);
      },
    });
  }

  private writeCache(): void {
    try {
      const cache: Cache = { uid: this.owner, prefs: this.state() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      /* storage unavailable: the account copy still keeps the settings */
    }
  }

  private readCache(): Cache {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { uid?: unknown; prefs?: unknown };
        return {
          uid: typeof parsed.uid === 'string' ? parsed.uid : null,
          prefs: sanitize(parsed.prefs),
        };
      }

      // The theme choice from before preferences moved to the account.
      const legacy = localStorage.getItem(LEGACY_THEME_KEY);
      if (legacy && THEMES.includes(legacy))
        return { uid: null, prefs: { theme: legacy as ThemeMode } };
    } catch {
      /* unreadable cache: start from defaults */
    }

    return { uid: null, prefs: {} };
  }
}
