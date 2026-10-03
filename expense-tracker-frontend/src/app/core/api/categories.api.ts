import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CategoryDto, CreateCategoryRequest, UpdateCategoryRequest } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/categories`;

  list(includeArchived = true): Observable<CategoryDto[]> {
    return this.http.get<CategoryDto[]>(this.url, { params: { includeArchived } });
  }

  create(request: CreateCategoryRequest): Observable<CategoryDto> {
    return this.http.post<CategoryDto>(this.url, request);
  }

  update(id: string, request: UpdateCategoryRequest): Observable<CategoryDto> {
    return this.http.put<CategoryDto>(`${this.url}/${id}`, request);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
