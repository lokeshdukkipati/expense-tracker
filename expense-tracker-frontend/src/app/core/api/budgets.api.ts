import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BudgetDto, BudgetStatusDto, CreateBudgetRequest, UpdateBudgetRequest } from '../models/api.models';
import { toParams } from './http-utils';

@Injectable({ providedIn: 'root' })
export class BudgetsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/budgets`;

  list(): Observable<BudgetDto[]> {
    return this.http.get<BudgetDto[]>(this.url);
  }

  status(): Observable<BudgetStatusDto[]> {
    return this.http.get<BudgetStatusDto[]>(`${this.url}/status`, { params: toParams({}) });
  }

  create(request: CreateBudgetRequest): Observable<BudgetDto> {
    return this.http.post<BudgetDto>(this.url, request);
  }

  update(id: string, request: UpdateBudgetRequest): Observable<BudgetDto> {
    return this.http.put<BudgetDto>(`${this.url}/${id}`, request);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
