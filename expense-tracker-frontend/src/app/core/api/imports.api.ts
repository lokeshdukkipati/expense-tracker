import {
  HttpClient,
  HttpEvent,
  HttpEventType,
  HttpProgressEvent,
  HttpResponse,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ImportBatchDto,
  ImportMappings,
  ImportMatchMode,
  ImportPreviewDto,
  ImportResultDto,
} from '../models/api.models';

export interface UploadProgress<T> {
  /** 0-100 while uploading. */
  progress: number;
  /** Set when the server has answered. */
  result?: T;
}

export interface ImportRunOptions {
  /** IANA zone the times in the file were written in. */
  timeZone: string;
  matchMode: ImportMatchMode;
  mappings?: ImportMappings | null;
}

@Injectable({ providedIn: 'root' })
export class ImportsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/imports`;

  preview(
    file: File,
    options: ImportRunOptions,
  ): Observable<UploadProgress<ImportPreviewDto>> {
    return this.upload<ImportPreviewDto>(`${this.url}/preview`, file, {
      ...options,
      mappings: null,
    });
  }

  import(
    file: File,
    options: ImportRunOptions,
  ): Observable<UploadProgress<ImportResultDto>> {
    return this.upload<ImportResultDto>(this.url, file, options);
  }

  list(): Observable<ImportBatchDto[]> {
    return this.http.get<ImportBatchDto[]>(this.url);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  private upload<T>(
    url: string,
    file: File,
    options: ImportRunOptions,
  ): Observable<UploadProgress<T>> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('timeZone', options.timeZone);
    form.append('matchMode', options.matchMode);
    if (options.mappings)
      form.append('mappings', JSON.stringify(options.mappings));

    return this.http
      .post<T>(url, form, { observe: 'events', reportProgress: true })
      .pipe(
        filter(
          (event) =>
            event.type === HttpEventType.UploadProgress ||
            event.type === HttpEventType.Response,
        ),
        map((event: HttpEvent<T>): UploadProgress<T> => {
          if (event.type === HttpEventType.Response)
            return {
              progress: 100,
              result: (event as HttpResponse<T>).body as T,
            };
          const progress = event as HttpProgressEvent;
          const total = progress.total ?? file.size;
          return {
            progress: total
              ? Math.min(99, Math.round((progress.loaded / total) * 100))
              : 0,
          };
        }),
      );
  }
}
