import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DuplicateChargeDto } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class DuplicatesApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/analytics/duplicates`;

  /** Pairs of expenses that look like the same charge made twice. Nothing is deleted. */
  find(days = 90): Observable<DuplicateChargeDto[]> {
    return this.http.get<DuplicateChargeDto[]>(this.url, { params: { days } });
  }
}
