import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ContributeGoalRequest,
  CreateGoalRequest,
  GoalDto,
  UpdateGoalRequest,
} from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class GoalsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/goals`;

  list(includeArchived = false): Observable<GoalDto[]> {
    return this.http.get<GoalDto[]>(this.url, { params: { includeArchived } });
  }

  get(id: string): Observable<GoalDto> {
    return this.http.get<GoalDto>(`${this.url}/${id}`);
  }

  create(request: CreateGoalRequest): Observable<GoalDto> {
    return this.http.post<GoalDto>(this.url, request);
  }

  update(id: string, request: UpdateGoalRequest): Observable<GoalDto> {
    return this.http.put<GoalDto>(`${this.url}/${id}`, request);
  }

  /** Positive amounts add to a manually tracked goal; negative amounts take money out. */
  contribute(id: string, request: ContributeGoalRequest): Observable<GoalDto> {
    return this.http.post<GoalDto>(`${this.url}/${id}/contribute`, request);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
