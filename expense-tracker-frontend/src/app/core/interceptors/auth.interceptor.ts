import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

/** Adds the bearer token to API calls and transparently renews it once when the API answers 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);

  const auth = inject(AuthService);
  const isPublic = PUBLIC_PATHS.some((p) => req.url.includes(p));

  const withToken = (request: HttpRequest<unknown>): HttpRequest<unknown> => {
    const token = auth.accessToken();
    return token && !isPublic ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
  };

  return next(withToken(req)).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isPublic) {
        if (!auth.hasRefreshToken()) {
          auth.logout({ expired: true });
          return throwError(() => error);
        }

        return auth.refresh().pipe(
          switchMap(() => next(withToken(req))),
          catchError((refreshError: unknown) => {
            auth.logout({ expired: true });
            return throwError(() => refreshError);
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
