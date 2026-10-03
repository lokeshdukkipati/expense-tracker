import { HttpParams } from '@angular/common/http';
import { TIME_ZONE } from '../utils/dates';

/** Builds query params, skipping null / undefined / empty values and always sending the caller's time zone. */
export function toParams(values: object, withTimeZone = true): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === '') continue;
    params = params.set(key, String(value));
  }
  return withTimeZone ? params.set('timeZone', TIME_ZONE) : params;
}
