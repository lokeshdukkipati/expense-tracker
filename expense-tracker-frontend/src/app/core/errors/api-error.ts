import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetails } from '../models/api.models';

/** Uniform error shape for everything the API (or the network) can throw at us. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    override readonly message: string,
    readonly errors: Record<string, string[]> = {},
    readonly traceId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get hasFieldErrors(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }

  /** First message for a field (field names are camelCase, as the API returns them). */
  fieldError(field: string): string | null {
    const key = Object.keys(this.errors).find((k) => k.toLowerCase() === field.toLowerCase());
    return key ? (this.errors[key][0] ?? null) : null;
  }

  static fromProblem(status: number, body: ProblemDetails | null | undefined): ApiError {
    const message = body?.detail || body?.title || defaultMessage(status);
    return new ApiError(status, body?.code ?? defaultCode(status), body?.title ?? 'Error', message, body?.errors ?? {}, body?.traceId);
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) return error;

    if (error instanceof HttpErrorResponse) {
      const body = typeof error.error === 'object' && error.error !== null && !(error.error instanceof Blob)
        ? (error.error as ProblemDetails)
        : null;
      return ApiError.fromProblem(error.status, body);
    }

    const message = error instanceof Error ? error.message : 'Something went wrong.';
    return new ApiError(-1, 'client_error', 'Error', message);
  }
}

function defaultCode(status: number): string {
  if (status === 0) return 'network';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return status >= 500 ? 'server_error' : 'error';
}

function defaultMessage(status: number): string {
  switch (status) {
    case 0:
      return "Can't reach the server. Check your connection and try again.";
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return "You don't have access to this.";
    case 404:
      return 'We could not find what you were looking for.';
    case 429:
      return 'Too many requests. Please slow down and try again shortly.';
    default:
      return status >= 500 ? 'The server ran into a problem. Please try again.' : 'Something went wrong.';
  }
}
