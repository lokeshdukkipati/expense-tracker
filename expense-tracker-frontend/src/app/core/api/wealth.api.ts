import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AchievementsDto, NetWorthDto } from '../models/api.models';
import { toParams } from './http-utils';

@Injectable({ providedIn: 'root' })
export class WealthApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/wealth`;

  /** Assets, liabilities and net worth now, by account type, with month-end history (2-36 months). */
  netWorth(months = 12): Observable<NetWorthDto> {
    return this.http.get<NetWorthDto>(`${this.url}/net-worth`, {
      params: toParams({ months }),
    });
  }

  /** Streaks (logging, no-spend, budget) and badges, computed from the user's data. */
  achievements(): Observable<AchievementsDto> {
    return this.http.get<AchievementsDto>(`${this.url}/achievements`, {
      params: toParams({}),
    });
  }
}
