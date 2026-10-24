import { Injectable, signal } from '@angular/core';

export type StoryTone = 'brand' | 'success' | 'warning' | 'danger' | 'info';

/** The picture under a story card's text. */
export type StoryVisual =
  | {
      kind: 'rank';
      items: { label: string; text: string; ratio: number; muted?: boolean }[];
    }
  | { kind: 'week'; days: { label: string; ratio: number; accent: boolean }[] }
  | { kind: 'ring'; percent: number; center: string; caption: string }
  | {
      kind: 'receipt';
      title: string;
      lines: { label: string; value: string }[];
      total: string;
    };

export interface StoryAction {
  label: string;
  /** An app route such as "/analytics". */
  link: string;
}

export interface StoryCard {
  id: string;
  /** A small label above the number, for example the dates covered. */
  kicker?: string;
  title: string;
  /** The big number or phrase, for example "₹12.4K". */
  metric?: string;
  metricLabel?: string;
  body?: string;
  tone?: StoryTone;
  visual?: StoryVisual;
  action?: StoryAction;
}

export interface StoryRequest {
  title: string;
  subtitle: string;
  cards: StoryCard[];
}

/** Opens the full-screen story viewer from anywhere. The viewer itself lives in the app shell. */
@Injectable({ providedIn: 'root' })
export class StoryService {
  readonly request = signal<StoryRequest | null>(null);

  open(request: StoryRequest): void {
    if (request.cards.length > 0) this.request.set(request);
  }

  close(): void {
    this.request.set(null);
  }
}
