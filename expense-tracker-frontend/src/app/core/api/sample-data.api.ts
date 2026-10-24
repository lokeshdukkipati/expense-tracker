import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SampleDataStatusDto } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class SampleDataApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/sample-data`;

  status(): Observable<SampleDataStatusDto> {
    return this.http.get<SampleDataStatusDto>(this.url);
  }

  /** Adds three demo accounts, about 90 days of transactions and two goals. */
  load(): Observable<SampleDataStatusDto> {
    return this.http.post<SampleDataStatusDto>(this.url, {});
  }

  /** Removes the demo accounts and everything recorded on them. */
  remove(): Observable<void> {
    return this.http.delete<void>(this.url);
  }
}
