import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AnalyticsFilterParams, AnomalyDto, CategoryBreakdownDto, CategoryComparisonDto, ForecastDto, PatternsDto,
  RecurringExpenseDto, SummaryDto, TagStatDto, TopDescriptionDto, TransactionType, TrendGranularity, TrendPointDto,
} from '../models/api.models';
import { toParams } from './http-utils';

@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/analytics`;

  summary(filter: AnalyticsFilterParams): Observable<SummaryDto> {
    return this.http.get<SummaryDto>(`${this.url}/summary`, { params: toParams(filter) });
  }

  categories(filter: AnalyticsFilterParams, type: TransactionType = 'Expense', parentId?: string | null): Observable<CategoryBreakdownDto> {
    return this.http.get<CategoryBreakdownDto>(`${this.url}/categories`, { params: toParams({ ...filter, type, parentId }) });
  }

  categoryComparison(filter: AnalyticsFilterParams): Observable<CategoryComparisonDto[]> {
    return this.http.get<CategoryComparisonDto[]>(`${this.url}/category-comparison`, { params: toParams(filter) });
  }

  trend(filter: AnalyticsFilterParams, granularity: TrendGranularity): Observable<TrendPointDto[]> {
    return this.http.get<TrendPointDto[]>(`${this.url}/trend`, { params: toParams({ ...filter, granularity }) });
  }

  patterns(filter: AnalyticsFilterParams): Observable<PatternsDto> {
    return this.http.get<PatternsDto>(`${this.url}/patterns`, { params: toParams(filter) });
  }

  topDescriptions(filter: AnalyticsFilterParams, type: TransactionType = 'Expense', limit = 50): Observable<TopDescriptionDto[]> {
    return this.http.get<TopDescriptionDto[]>(`${this.url}/top-descriptions`, { params: toParams({ ...filter, type, limit }) });
  }

  recurring(): Observable<RecurringExpenseDto[]> {
    return this.http.get<RecurringExpenseDto[]>(`${this.url}/recurring`, { params: toParams({}) });
  }

  anomalies(filter: AnalyticsFilterParams): Observable<AnomalyDto[]> {
    return this.http.get<AnomalyDto[]>(`${this.url}/anomalies`, { params: toParams(filter) });
  }

  forecast(): Observable<ForecastDto> {
    return this.http.get<ForecastDto>(`${this.url}/forecast`, { params: toParams({}) });
  }

  tags(filter: AnalyticsFilterParams): Observable<TagStatDto[]> {
    return this.http.get<TagStatDto[]>(`${this.url}/tags`, { params: toParams(filter) });
  }
}
