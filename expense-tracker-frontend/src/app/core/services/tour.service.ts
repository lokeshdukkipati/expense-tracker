import { Injectable, computed, inject, signal } from '@angular/core';
import { PreferencesService } from './preferences.service';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector of the element to highlight. When it is not on screen (for example on a phone) the step is simply shown on its own. */
  target?: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to your money, organised',
    body: 'Take a 30-second tour, or skip it and start adding your own data. You can replay it any time from Settings.',
  },
  {
    id: 'quick-add',
    title: 'Add things in a sentence',
    body: 'Press Q, or tap the quick-add button, and type something like “coffee 180 yesterday”. The amount, date and category are worked out for you.',
    target: '[data-tour="quick-add"]',
  },
  {
    id: 'palette',
    title: 'Jump anywhere',
    body: 'Press Ctrl + K, or tap search, to open any page or start any action. Press ? to see every keyboard shortcut.',
    target: '[data-tour="palette"]',
  },
  {
    id: 'accounts',
    title: 'Cash, bank and cards',
    body: 'Add each place your money lives. Moving money between them, like an ATM withdrawal or a card payment, is a transfer, so it never counts as spending.',
    target: '[data-tour="nav-accounts"]',
  },
  {
    id: 'import',
    title: 'Bring your history',
    body: 'Import a Money Manager or bank file. Transfers, duplicates and categories are handled for you, and one tap undoes an import.',
    target: '[data-tour="nav-import"]',
  },
  {
    id: 'goals',
    title: 'Save towards something',
    body: 'Create a goal and watch the ring fill. Streaks and badges reward the habits that get you there.',
    target: '[data-tour="nav-goals"]',
  },
  {
    id: 'done',
    title: 'You are ready',
    body: 'Want to look around with demo data first? Load it here, or any time in Settings, and remove it with one tap.',
  },
];

/** The guided tour. Start it from anywhere; it remembers on the account that it has been seen. */
@Injectable({ providedIn: 'root' })
export class TourService {
  private readonly prefs = inject(PreferencesService);

  readonly steps = TOUR_STEPS;
  readonly active = signal(false);
  readonly index = signal(0);

  readonly step = computed(() => this.steps[this.index()] ?? this.steps[0]!);
  readonly isFirst = computed(() => this.index() === 0);
  readonly isLast = computed(() => this.index() === this.steps.length - 1);

  start(): void {
    this.index.set(0);
    this.active.set(true);
  }

  /** Starts the tour once, for someone who has never seen it. Call when the account's preferences have loaded. */
  maybeStart(): void {
    if (this.prefs.synced() && !this.prefs.onboardingDone() && !this.active())
      this.start();
  }

  next(): void {
    if (this.isLast()) this.finish();
    else this.index.update((i) => i + 1);
  }

  back(): void {
    this.index.update((i) => Math.max(0, i - 1));
  }

  skip(): void {
    this.finish();
  }

  finish(): void {
    this.active.set(false);
    if (!this.prefs.onboardingDone()) this.prefs.completeOnboarding(true);
  }
}
