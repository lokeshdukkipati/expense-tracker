import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiError } from '../errors/api-error';
import { ProblemDetails } from '../models/api.models';
import { ToastService } from '../services/toast.service';

/**
 * Outermost interceptor: every failed API call leaves here as a uniform ApiError, and the user is told once.
 * 401 is handled by the auth interceptor (token refresh / redirect), so it never produces a toast here.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);

  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) return throwError(() => ApiError.from(error));

      // File downloads fail with a Blob body; read the problem details out of it.
      const parsed$ =
        error.error instanceof Blob
          ? from(error.error.text()).pipe(
              map((text) => {
                try {
                  return JSON.parse(text) as ProblemDetails;
                } catch {
                  return null;
                }
              }),
            )
          : of(null);

      return parsed$.pipe(
        map((body) => (body ? ApiError.fromProblem(error.status, body) : ApiError.from(error))),
        switchMap((apiError) => {
          notify(apiError, toast);
          return throwError(() => apiError);
        }),
      );
    }),
  );
};

function notify(error: ApiError, toast: ToastService): void {
  if (error.status === 401) return;

  if (error.isNetwork) {
    toast.error(error.message, 'Offline?');
  } else if (error.code === 'validation_failed') {
    toast.warning('Please check the highlighted fields and try again.');
  } else if (error.status >= 500) {
    toast.error(error.traceId ? `${error.message} (ref ${error.traceId})` : error.message, 'Server error');
  } else if (error.status === 429) {
    toast.warning(error.message, 'Slow down');
  } else {
    toast.error(error.message);
  }
}
