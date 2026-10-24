import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PreferencesPatch, UserPreferences } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class PreferencesApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/preferences`;

  get(): Observable<UserPreferences> {
    return this.http.get<UserPreferences>(this.url);
  }

  /** Merges the given keys into the saved preferences. A key set to null is removed. */
  patch(body: PreferencesPatch): Observable<UserPreferences> {
    return this.http.patch<UserPreferences>(this.url, body);
  }
}
