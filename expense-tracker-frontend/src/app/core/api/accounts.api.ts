import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AccountDto, CreateAccountRequest, UpdateAccountRequest } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/accounts`;

  list(includeArchived = true): Observable<AccountDto[]> {
    return this.http.get<AccountDto[]>(this.url, { params: { includeArchived } });
  }

  create(request: CreateAccountRequest): Observable<AccountDto> {
    return this.http.post<AccountDto>(this.url, request);
  }

  update(id: string, request: UpdateAccountRequest): Observable<AccountDto> {
    return this.http.put<AccountDto>(`${this.url}/${id}`, request);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
