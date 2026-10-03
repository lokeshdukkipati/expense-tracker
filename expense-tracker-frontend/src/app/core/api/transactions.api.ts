import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ExportFormat, PagedResult, TransactionDto, TransactionFilterParams, TransactionInput,
  TransactionQueryParams, UpdateTransactionInput,
} from '../models/api.models';
import { toParams } from './http-utils';

@Injectable({ providedIn: 'root' })
export class TransactionsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/transactions`;

  query(query: TransactionQueryParams): Observable<PagedResult<TransactionDto>> {
    return this.http.get<PagedResult<TransactionDto>>(this.url, { params: toParams(query) });
  }

  get(id: string): Observable<TransactionDto> {
    return this.http.get<TransactionDto>(`${this.url}/${id}`);
  }

  create(input: TransactionInput): Observable<TransactionDto> {
    return this.http.post<TransactionDto>(this.url, input);
  }

  update(id: string, input: UpdateTransactionInput): Observable<TransactionDto> {
    return this.http.put<TransactionDto>(`${this.url}/${id}`, input);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  bulkDelete(ids: string[]): Observable<{ deleted: number }> {
    return this.http.post<{ deleted: number }>(`${this.url}/bulk-delete`, { ids });
  }

  export(filter: TransactionFilterParams, format: ExportFormat): Observable<{ blob: Blob; filename: string }> {
    return this.http
      .get(`${this.url}/export`, { params: toParams({ ...filter, format }), observe: 'response', responseType: 'blob' })
      .pipe(map((response: HttpResponse<Blob>) => ({
        blob: response.body ?? new Blob(),
        filename: filenameFrom(response) ?? `transactions.${format === 'Xlsx' ? 'xlsx' : 'csv'}`,
      })));
  }
}

function filenameFrom(response: HttpResponse<Blob>): string | null {
  const header = response.headers.get('Content-Disposition');
  const match = header ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header) : null;
  return match ? decodeURIComponent(match[1]) : null;
}
