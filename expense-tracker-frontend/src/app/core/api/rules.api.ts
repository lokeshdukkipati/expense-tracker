import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApplyRuleRequest,
  ApplyRuleResultDto,
  CreateRuleRequest,
  RuleDto,
  RuleMatchResultDto,
  TransactionType,
  UpdateRuleRequest,
} from '../models/api.models';
import { toParams } from './http-utils';

@Injectable({ providedIn: 'root' })
export class RulesApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/rules`;

  list(): Observable<RuleDto[]> {
    return this.http.get<RuleDto[]>(this.url);
  }

  create(request: CreateRuleRequest): Observable<RuleDto> {
    return this.http.post<RuleDto>(this.url, request);
  }

  update(id: string, request: UpdateRuleRequest): Observable<RuleDto> {
    return this.http.put<RuleDto>(`${this.url}/${id}`, request);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  /** Which rule (if any) would categorise this text? Used while typing a quick-add entry. */
  match(type: TransactionType, text: string): Observable<RuleMatchResultDto> {
    return this.http.get<RuleMatchResultDto>(`${this.url}/match`, {
      params: toParams({ type, text }, false),
    });
  }

  /** Re-categorises existing transactions that match the rule. With dryRun nothing changes; only a count is returned. */
  apply(id: string, request: ApplyRuleRequest): Observable<ApplyRuleResultDto> {
    return this.http.post<ApplyRuleResultDto>(
      `${this.url}/${id}/apply`,
      request,
    );
  }
}
