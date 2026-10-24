import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ConvertToTransferRequest,
  CreateTransferRequest,
  ReconcileAccountRequest,
  ReconcileResultDto,
  TransferDto,
  TransferResultDto,
  UpdateTransferRequest,
} from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class TransfersApi {
  private readonly http = inject(HttpClient);
  private readonly url = environment.apiUrl;

  create(request: CreateTransferRequest): Observable<TransferResultDto> {
    return this.http.post<TransferResultDto>(`${this.url}/transfers`, request);
  }

  get(groupId: string): Observable<TransferDto> {
    return this.http.get<TransferDto>(`${this.url}/transfers/${groupId}`);
  }

  update(
    groupId: string,
    request: UpdateTransferRequest,
  ): Observable<TransferDto> {
    return this.http.put<TransferDto>(
      `${this.url}/transfers/${groupId}`,
      request,
    );
  }

  /** Removes both legs of the transfer. */
  delete(groupId: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/transfers/${groupId}`);
  }

  /** Turns an existing expense or income into a transfer to or from another account. */
  convert(
    transactionId: string,
    request: ConvertToTransferRequest,
  ): Observable<TransferDto> {
    return this.http.post<TransferDto>(
      `${this.url}/transactions/${transactionId}/convert-to-transfer`,
      request,
    );
  }

  /** Sets the account's balance to what the user actually has, by correcting its opening balance. */
  reconcile(
    accountId: string,
    request: ReconcileAccountRequest,
  ): Observable<ReconcileResultDto> {
    return this.http.post<ReconcileResultDto>(
      `${this.url}/accounts/${accountId}/reconcile`,
      request,
    );
  }
}
