import { ErrorHandler, Injectable, NgZone, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ToastService } from '../services/toast.service';
import { ApiError } from './api-error';

/**
 * Last line of defence on the client: anything not already handled (template errors, rejected promises,
 * failed lazy-chunk loads) ends up here instead of silently breaking the screen.
 * Hook an error reporter (Sentry, App Insights...) into `report` before launch.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toast = inject(ToastService);
  private readonly zone = inject(NgZone);

  handleError(error: unknown): void {
    const original = (error as { rejection?: unknown })?.rejection ?? error;

    // HTTP failures were already reported to the user by the error interceptor.
    if (original instanceof ApiError) return;

    this.report(original);

    const message = this.isChunkLoadError(original)
      ? 'A new version is available. Please refresh the page.'
      : 'Something went wrong. If it keeps happening, please reload the page.';

    this.zone.run(() => this.toast.error(message, 'Unexpected error'));
  }

  private report(error: unknown): void {
    if (!environment.production) {
      console.error('[GlobalErrorHandler]', error);
    }
    // TODO(launch): forward to your monitoring service here.
  }

  private isChunkLoadError(error: unknown): boolean {
    const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    return /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text);
  }
}
