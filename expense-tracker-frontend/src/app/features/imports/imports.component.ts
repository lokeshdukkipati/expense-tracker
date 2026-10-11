import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ImportsApi } from '../../core/api/imports.api';
import { ApiError } from '../../core/errors/api-error';
import {
  DuplicateRowDto,
  FileAccountDto,
  FileCategoryDto,
  ImportBatchDto,
  ImportMatchMode,
  ImportPreviewDto,
  ImportResultDto,
  ImportWarningDto,
  InvalidRowDto,
  ImportRowSampleDto,
} from '../../core/models/api.models';
import { ConfirmService } from '../../core/services/confirm.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { buildCsv } from '../../core/utils/csv';
import { TIME_ZONE } from '../../core/utils/dates';
import {
  downloadBlob,
  formatDate,
  formatDateTime,
  formatNumber,
} from '../../core/utils/format';
import {
  TableState,
  compareNumber,
  compareText,
} from '../../core/utils/table-state';
import { ProgressBarComponent } from '../../shared/charts/progress-bar.component';
import {
  SearchBoxComponent,
  SegmentOption,
  SegmentedComponent,
  SortHeaderComponent,
} from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { CountUpComponent, MoneyPipe } from '../../shared/ui/money.component';
import { PaginatorComponent } from '../../shared/ui/paginator.component';
import {
  SelectComponent,
  SelectOption,
} from '../../shared/ui/select.component';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  SkeletonComponent,
  SpinnerComponent,
} from '../../shared/ui/ui-bits.component';

type Step = 'upload' | 'review' | 'done';
type Tab = 'new' | 'duplicates' | 'invalid' | 'warnings' | 'mapping';

const MAX_BYTES = 10 * 1024 * 1024;
const AUTO = '';

const MODE_HELP: Record<ImportMatchMode, string> = {
  Exact:
    'Skips a row only when every field is identical to a transaction you already have.',
  Smart:
    'Also skips rows with the same time, type and amount as an existing transaction, even if you edited its description, category or account. Recommended.',
  Loose:
    'Also skips rows with the same day, type and amount. Use it when your file has no reliable times; it may skip genuine look-alike purchases.',
};

const COMMON_ZONES = [
  'Asia/Kolkata',
  'UTC',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
];

function buildZones(): SelectOption[] {
  const zones = [TIME_ZONE, ...COMMON_ZONES.filter((z) => z !== TIME_ZONE)];
  return zones.map((z) => ({
    value: z,
    label: z === TIME_ZONE ? `${z} (this device)` : z,
  }));
}

@Component({
  selector: 'app-imports',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    IconComponent,
    MoneyPipe,
    CountUpComponent,
    ProgressBarComponent,
    SearchBoxComponent,
    SegmentedComponent,
    SortHeaderComponent,
    PaginatorComponent,
    SelectComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
    SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="imp">
        <header class="head">
          <h1>Import</h1>
          <p>
            Bring in an Excel or CSV export. You review everything first, and
            the same transaction is never added twice.
          </p>
        </header>

        <ol class="steps" aria-label="Import steps">
          <li
            [class.on]="step() === 'upload'"
            [class.done]="step() !== 'upload'"
          >
            <b>1</b><span>Choose file</span>
          </li>
          <li [class.on]="step() === 'review'" [class.done]="step() === 'done'">
            <b>2</b><span>Review</span>
          </li>
          <li [class.on]="step() === 'done'"><b>3</b><span>Done</span></li>
        </ol>

        <ng-template #settingsTpl>
          <div class="settings">
            <div class="field">
              <label>Time zone of the times in your file</label>
              <app-select
                [options]="zones"
                [value]="timeZone()"
                [searchable]="true"
                (valueChange)="setTimeZone($event)"
                ariaLabel="Time zone of the file"
              />
              <span class="field-hint"
                >This device is in {{ deviceZone }}. Change it if the file was
                exported somewhere else.</span
              >
            </div>
            <div class="field">
              <label>Duplicate matching</label>
              <app-segmented
                class="block"
                [options]="modes"
                [value]="matchMode()"
                (valueChange)="setMode($event)"
              />
              <span class="field-hint">{{ modeHelp() }}</span>
            </div>
          </div>
        </ng-template>

        <!-- ============================== 1. upload ============================== -->
        @if (step() === 'upload') {
          <section class="card card-pad stack">
            <div
              class="drop"
              [class.over]="dragging()"
              [class.busy]="analyzing()"
              tabindex="0"
              role="button"
              aria-label="Choose a file to import"
              (click)="picker.click()"
              (keydown.enter)="picker.click()"
              (keydown.space)="picker.click(); $event.preventDefault()"
              (dragover)="onDrag($event, true)"
              (dragleave)="onDrag($event, false)"
              (drop)="onDrop($event)"
            >
              <input
                #picker
                type="file"
                accept=".xlsx,.csv"
                hidden
                (change)="onPick($event)"
              />
              @if (analyzing()) {
                <div class="spin"><app-spinner [size]="34" /></div>
                <h3 class="truncate">Reading {{ file()?.name }}…</h3>
                <app-progress [value]="progress()" tone="primary" />
                <p>
                  {{
                    progress() < 100
                      ? 'Uploading ' + progress() + '%'
                      : 'Checking for duplicates…'
                  }}
                </p>
              } @else {
                <div class="art"><app-icon name="upload" [size]="30" /></div>
                <h3>Drop your file here</h3>
                <p>
                  or <span class="link">browse</span> · .xlsx or .csv, up to 10
                  MB
                </p>
              }
            </div>

            @if (problem(); as p) {
              <div class="alert" role="alert">
                <app-icon name="alert-circle" [size]="18" />
                <span>{{ p }}</span>
              </div>
            }

            <ng-container [ngTemplateOutlet]="settingsTpl" />

            <div class="help">
              <div>
                <strong>Columns we read</strong>
                <p>
                  <b>Required:</b> Period (date and time), Income/Expense,
                  Amount.<br /><b>Optional:</b> Accounts, Category, Subcategory,
                  Description, Note, Currency.
                </p>
              </div>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                (click)="downloadSample()"
              >
                <app-icon name="download" [size]="15" /> Sample CSV
              </button>
            </div>

            <ul class="tips">
              <li>
                <app-icon name="shield" [size]="16" /> Same file twice is
                rejected. Overlapping files add only the new rows.
              </li>
              <li>
                <app-icon name="download" [size]="16" /> A CSV exported from
                this app can be imported again.
              </li>
              <li>
                <app-icon name="refresh" [size]="16" /> Changed your mind? Undo
                any import from the history below.
              </li>
            </ul>
          </section>
        }

        <!-- ============================== 2. review ============================== -->
        @if (step() === 'review') {
          @if (preview(); as p) {
            <section class="card filebar">
              <span class="icon-tile"><app-icon name="file" /></span>
              <div class="fi">
                <strong class="truncate">{{ p.fileName }}</strong
                ><small
                  >{{ p.format }} · {{ bytes(file()?.size ?? 0) }} ·
                  {{ num(p.totalRows) }} rows</small
                >
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                (click)="reset()"
                [disabled]="importing()"
              >
                <app-icon name="refresh" [size]="14" /> Change file
              </button>
            </section>

            @if (problem(); as e) {
              <div class="alert" role="alert">
                <app-icon name="alert-circle" [size]="18" />
                <span>{{ e }}</span>
              </div>
            }

            @if (p.fileAlreadyImported) {
              <div class="banner danger">
                <app-icon name="alert-triangle" [size]="20" />
                <div>
                  <b>This exact file was already imported</b
                  ><span
                    >{{
                      p.previousImport
                        ? 'On ' + dt(p.previousImport.createdAt) + '. '
                        : ''
                    }}Nothing will change unless you undo that import
                    first.</span
                  >
                </div>
                @if (p.previousImport) {
                  <button
                    type="button"
                    class="btn btn-outline-danger btn-sm"
                    (click)="undoPrevious(p.previousImport)"
                    [disabled]="undoing() !== null"
                  >
                    Undo it now
                  </button>
                }
              </div>
            } @else if (p.newRows === 0) {
              <div class="banner info">
                <app-icon name="check" [size]="20" />
                <div>
                  <b>Everything here is already in your account</b
                  ><span
                    >All {{ num(p.duplicateRows) }} valid rows exist already, so
                    there is nothing new to import.</span
                  >
                </div>
              </div>
            }
            @if (p.invalidRows > 0) {
              <div class="banner warn">
                <app-icon name="alert-triangle" [size]="20" />
                <div>
                  <b
                    >{{ num(p.invalidRows) }} row{{
                      p.invalidRows === 1 ? '' : 's'
                    }}
                    can't be imported</b
                  ><span
                    >They are skipped; the rest imports normally. See the
                    Invalid tab for the reasons.</span
                  >
                </div>
              </div>
            }

            <div class="stats reveal">
              <div class="card stat good">
                <span>New</span
                ><strong
                  ><app-count-up [value]="p.newRows" [format]="num" /></strong
                ><small>will be imported</small>
              </div>
              <div class="card stat">
                <span>Duplicates</span
                ><strong
                  ><app-count-up
                    [value]="p.duplicateRows"
                    [format]="num" /></strong
                ><small>skipped</small>
              </div>
              <div class="card stat" [class.bad]="p.invalidRows > 0">
                <span>Invalid</span
                ><strong
                  ><app-count-up
                    [value]="p.invalidRows"
                    [format]="num" /></strong
                ><small>can't be read</small>
              </div>
              <div class="card stat">
                <span>In file</span
                ><strong
                  ><app-count-up [value]="p.totalRows" [format]="num" /></strong
                ><small>{{
                  p.firstDate
                    ? date(p.firstDate) + ' to ' + date(p.lastDate)
                    : 'no dates'
                }}</small>
              </div>
            </div>

            <section class="card card-pad">
              <div class="card-head">
                <h3 class="card-title">
                  <app-icon name="settings" [size]="18" /> Matching and time
                  zone
                </h3>
                @if (analyzing()) {
                  <span class="muted rechecking"
                    ><app-spinner [size]="14" /> Re-checking…</span
                  >
                }
              </div>
              <ng-container [ngTemplateOutlet]="settingsTpl" />
            </section>

            <section
              class="card card-pad panel"
              [class.is-loading]="analyzing()"
            >
              <nav class="tabs" role="tablist" aria-label="Preview sections">
                <button
                  type="button"
                  role="tab"
                  [class.on]="tab() === 'new'"
                  [attr.aria-selected]="tab() === 'new'"
                  (click)="tab.set('new')"
                >
                  New <em>{{ num(p.newRows) }}</em>
                </button>
                <button
                  type="button"
                  role="tab"
                  [class.on]="tab() === 'duplicates'"
                  [attr.aria-selected]="tab() === 'duplicates'"
                  (click)="tab.set('duplicates')"
                >
                  Duplicates <em>{{ num(p.duplicateRows) }}</em>
                </button>
                <button
                  type="button"
                  role="tab"
                  [class.on]="tab() === 'invalid'"
                  [attr.aria-selected]="tab() === 'invalid'"
                  (click)="tab.set('invalid')"
                >
                  Invalid
                  <em [class.bad]="p.invalidRows > 0">{{
                    num(p.invalidRows)
                  }}</em>
                </button>
                <button
                  type="button"
                  role="tab"
                  [class.on]="tab() === 'warnings'"
                  [attr.aria-selected]="tab() === 'warnings'"
                  (click)="tab.set('warnings')"
                >
                  Warnings <em>{{ num(p.warningRows) }}</em>
                </button>
                <button
                  type="button"
                  role="tab"
                  [class.on]="tab() === 'mapping'"
                  [attr.aria-selected]="tab() === 'mapping'"
                  (click)="tab.set('mapping')"
                >
                  Mapping
                  @if (mappedCount() > 0) {
                    <em>{{ mappedCount() }}</em>
                  }
                </button>
              </nav>

              @switch (tab()) {
                @case ('new') {
                  @if (p.sampleNewRows.length === 0) {
                    <app-empty-state
                      icon="inbox"
                      title="Nothing new to import"
                      message="Every valid row in this file already exists in your account."
                    />
                  } @else {
                    <div class="tools">
                      <app-search-box
                        [value]="newTable.search()"
                        (valueChange)="newTable.setSearch($event)"
                        placeholder="Search new rows"
                      />
                    </div>
                    @if (p.newRows > p.sampleNewRows.length) {
                      <p class="note">
                        Showing the first {{ num(p.sampleNewRows.length) }} of
                        {{ num(p.newRows) }} new rows. All of them will be
                        imported.
                      </p>
                    }
                    @if (newTable.total() === 0) {
                      <app-empty-state
                        icon="search"
                        title="No matches"
                        message="Try a different search."
                        ><button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          (click)="newTable.setSearch('')"
                        >
                          Clear search
                        </button></app-empty-state
                      >
                    } @else {
                      <div class="table-wrap">
                        <table class="table">
                          <thead>
                            <tr>
                              <th>
                                <app-sort-header
                                  label="Date"
                                  key="date"
                                  [sort]="newTable.sort()"
                                  (toggle)="newTable.toggleSort($event)"
                                />
                              </th>
                              <th>Description</th>
                              <th class="hide-mobile">
                                <app-sort-header
                                  label="Category"
                                  key="category"
                                  [sort]="newTable.sort()"
                                  (toggle)="newTable.toggleSort($event)"
                                />
                              </th>
                              <th class="hide-tablet">Account</th>
                              <th class="right">
                                <app-sort-header
                                  label="Amount"
                                  key="amount"
                                  align="right"
                                  [sort]="newTable.sort()"
                                  (toggle)="newTable.toggleSort($event)"
                                />
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (
                              r of newTable.pageItems();
                              track r.rowNumber;
                              let i = $index
                            ) {
                              <tr [style.--i]="i">
                                <td class="nowrap">
                                  {{ dt(r.localTimestamp) }}
                                </td>
                                <td>
                                  <div class="cell-main">
                                    <strong>{{ r.description || '—' }}</strong
                                    ><small class="show-mobile">{{
                                      r.subcategory
                                        ? r.category + ' › ' + r.subcategory
                                        : r.category
                                    }}</small>
                                  </div>
                                </td>
                                <td class="hide-mobile">
                                  {{
                                    r.subcategory
                                      ? r.category + ' › ' + r.subcategory
                                      : r.category
                                  }}
                                </td>
                                <td class="hide-tablet muted">
                                  {{ r.account }}
                                </td>
                                <td
                                  class="right num"
                                  [class.text-success]="r.type === 'Income'"
                                >
                                  {{
                                    (r.type === 'Income' ? r.amount : -r.amount)
                                      | money: '' : r.currency
                                  }}
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                      <app-paginator
                        [total]="newTable.total()"
                        [page]="newTable.currentPage()"
                        [pageSize]="newTable.pageSize()"
                        (pageChange)="newTable.setPage($event)"
                        (pageSizeChange)="newTable.setPageSize($event)"
                      />
                    }
                  }
                }

                @case ('duplicates') {
                  @if (p.duplicateSamples.length === 0) {
                    <app-empty-state
                      icon="check"
                      title="No duplicates found"
                      message="None of the rows in this file match transactions you already have."
                    />
                  } @else {
                    <div class="tools">
                      <app-search-box
                        [value]="dupTable.search()"
                        (valueChange)="dupTable.setSearch($event)"
                        placeholder="Search duplicates"
                      />
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        (click)="downloadDuplicates(p)"
                      >
                        <app-icon name="download" [size]="15" /> CSV
                      </button>
                    </div>
                    @if (p.duplicateRows > p.duplicateSamples.length) {
                      <p class="note">
                        Showing the first
                        {{ num(p.duplicateSamples.length) }} of
                        {{ num(p.duplicateRows) }} duplicates.
                      </p>
                    }
                    @if (dupTable.total() === 0) {
                      <app-empty-state
                        icon="search"
                        title="No matches"
                        message="Try a different search."
                        ><button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          (click)="dupTable.setSearch('')"
                        >
                          Clear search
                        </button></app-empty-state
                      >
                    } @else {
                      <div class="table-wrap">
                        <table class="table">
                          <thead>
                            <tr>
                              <th>
                                <app-sort-header
                                  label="Date"
                                  key="date"
                                  [sort]="dupTable.sort()"
                                  (toggle)="dupTable.toggleSort($event)"
                                />
                              </th>
                              <th>Description and reason</th>
                              <th class="right">
                                <app-sort-header
                                  label="Amount"
                                  key="amount"
                                  align="right"
                                  [sort]="dupTable.sort()"
                                  (toggle)="dupTable.toggleSort($event)"
                                />
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (
                              r of dupTable.pageItems();
                              track r.rowNumber;
                              let i = $index
                            ) {
                              <tr [style.--i]="i">
                                <td class="nowrap">
                                  {{ dt(r.localTimestamp) }}
                                </td>
                                <td>
                                  <div class="cell-main">
                                    <strong>{{ r.description || '—' }}</strong
                                    ><small class="wrap">{{ r.reason }}</small>
                                  </div>
                                </td>
                                <td
                                  class="right num"
                                  [class.text-success]="r.type === 'Income'"
                                >
                                  {{
                                    (r.type === 'Income' ? r.amount : -r.amount)
                                      | money: '' : r.currency
                                  }}
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                      <app-paginator
                        [total]="dupTable.total()"
                        [page]="dupTable.currentPage()"
                        [pageSize]="dupTable.pageSize()"
                        (pageChange)="dupTable.setPage($event)"
                        (pageSizeChange)="dupTable.setPageSize($event)"
                      />
                    }
                  }
                }

                @case ('invalid') {
                  @if (p.invalidSamples.length === 0) {
                    <app-empty-state
                      icon="check"
                      title="Every row is valid"
                      message="No rows were rejected."
                    />
                  } @else {
                    <div class="tools">
                      <app-search-box
                        [value]="invalidTable.search()"
                        (valueChange)="invalidTable.setSearch($event)"
                        placeholder="Search reasons"
                      />
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        (click)="downloadInvalid(p)"
                      >
                        <app-icon name="download" [size]="15" /> CSV
                      </button>
                    </div>
                    @if (p.invalidRows > p.invalidSamples.length) {
                      <p class="note">
                        Showing the first {{ num(p.invalidSamples.length) }} of
                        {{ num(p.invalidRows) }} invalid rows.
                      </p>
                    }
                    @if (invalidTable.total() === 0) {
                      <app-empty-state
                        icon="search"
                        title="No matches"
                        message="Try a different search."
                        ><button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          (click)="invalidTable.setSearch('')"
                        >
                          Clear search
                        </button></app-empty-state
                      >
                    } @else {
                      <div class="table-wrap">
                        <table class="table">
                          <thead>
                            <tr>
                              <th style="width: 96px">
                                <app-sort-header
                                  label="Row"
                                  key="row"
                                  [sort]="invalidTable.sort()"
                                  (toggle)="invalidTable.toggleSort($event)"
                                />
                              </th>
                              <th>
                                <app-sort-header
                                  label="Reason"
                                  key="reason"
                                  [sort]="invalidTable.sort()"
                                  (toggle)="invalidTable.toggleSort($event)"
                                />
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (
                              r of invalidTable.pageItems();
                              track r.rowNumber
                            ) {
                              <tr>
                                <td class="num">#{{ r.rowNumber }}</td>
                                <td class="wrap">{{ r.reason }}</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                      <app-paginator
                        [total]="invalidTable.total()"
                        [page]="invalidTable.currentPage()"
                        [pageSize]="invalidTable.pageSize()"
                        (pageChange)="invalidTable.setPage($event)"
                        (pageSizeChange)="invalidTable.setPageSize($event)"
                      />
                    }
                  }
                }

                @case ('warnings') {
                  @if (p.warnings.length === 0) {
                    <app-empty-state
                      icon="check"
                      title="No warnings"
                      message="Nothing in this file looks unusual."
                    />
                  } @else {
                    <div class="tools">
                      <app-search-box
                        [value]="warnTable.search()"
                        (valueChange)="warnTable.setSearch($event)"
                        placeholder="Search warnings"
                      />
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        (click)="downloadWarnings(p)"
                      >
                        <app-icon name="download" [size]="15" /> CSV
                      </button>
                    </div>
                    <p class="note">
                      Warnings don't stop an import. They point at rows worth a
                      second look.
                    </p>
                    @if (warnTable.total() === 0) {
                      <app-empty-state
                        icon="search"
                        title="No matches"
                        message="Try a different search."
                        ><button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          (click)="warnTable.setSearch('')"
                        >
                          Clear search
                        </button></app-empty-state
                      >
                    } @else {
                      <div class="table-wrap">
                        <table class="table">
                          <thead>
                            <tr>
                              <th style="width: 96px">
                                <app-sort-header
                                  label="Row"
                                  key="row"
                                  [sort]="warnTable.sort()"
                                  (toggle)="warnTable.toggleSort($event)"
                                />
                              </th>
                              <th>
                                <app-sort-header
                                  label="Warning"
                                  key="message"
                                  [sort]="warnTable.sort()"
                                  (toggle)="warnTable.toggleSort($event)"
                                />
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (r of warnTable.pageItems(); track $index) {
                              <tr>
                                <td class="num">#{{ r.rowNumber }}</td>
                                <td class="wrap">{{ r.message }}</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                      <app-paginator
                        [total]="warnTable.total()"
                        [page]="warnTable.currentPage()"
                        [pageSize]="warnTable.pageSize()"
                        (pageChange)="warnTable.setPage($event)"
                        (pageSizeChange)="warnTable.setPageSize($event)"
                      />
                    }
                  }
                }

                @case ('mapping') {
                  @if (
                    p.fileAccounts.length === 0 && p.fileCategories.length === 0
                  ) {
                    <app-empty-state
                      icon="layers"
                      title="Nothing to map"
                      message="There are no new rows, so no accounts or categories are involved."
                    />
                  } @else {
                    <p class="note">
                      Choose where each name from your file should go. Leave a
                      name on <b>Create or match by name</b> to use the default.
                    </p>

                    <h4 class="sub">
                      Accounts <span>{{ mappedAccountCount() }} mapped</span>
                    </h4>
                    <div class="tools">
                      <app-search-box
                        [value]="acctTable.search()"
                        (valueChange)="acctTable.setSearch($event)"
                        placeholder="Search accounts"
                      />
                    </div>
                    @if (acctTable.total() === 0) {
                      <app-empty-state
                        icon="search"
                        title="No accounts match"
                        message="Try a different search."
                      />
                    } @else {
                      <div class="maprows">
                        @for (a of acctTable.pageItems(); track a.name) {
                          <div class="maprow">
                            <div class="who">
                              <strong class="truncate">{{ a.name }}</strong
                              ><small
                                >{{ a.rows }} new row{{
                                  a.rows === 1 ? '' : 's'
                                }}
                                · {{ accountNote(a) }}</small
                              >
                            </div>
                            <app-select
                              class="sel"
                              [options]="accountOptions()"
                              [value]="accountMap()[a.name] || auto"
                              [searchable]="true"
                              (valueChange)="mapAccount(a.name, $event)"
                              ariaLabel="Map account"
                            />
                          </div>
                        }
                      </div>
                      <app-paginator
                        [total]="acctTable.total()"
                        [page]="acctTable.currentPage()"
                        [pageSize]="acctTable.pageSize()"
                        [sizes]="[5, 10, 25]"
                        (pageChange)="acctTable.setPage($event)"
                        (pageSizeChange)="acctTable.setPageSize($event)"
                      />
                    }

                    <h4 class="sub">
                      Categories <span>{{ mappedCategoryCount() }} mapped</span>
                    </h4>
                    <div class="tools">
                      <app-search-box
                        [value]="catTable.search()"
                        (valueChange)="catTable.setSearch($event)"
                        placeholder="Search categories"
                      />
                    </div>
                    @if (catTable.total() === 0) {
                      <app-empty-state
                        icon="search"
                        title="No categories match"
                        message="Try a different search."
                      />
                    } @else {
                      <div class="maprows">
                        @for (
                          c of catTable.pageItems();
                          track c.type + c.name
                        ) {
                          <div class="maprow">
                            <div class="who">
                              <strong class="truncate">{{ c.name }}</strong
                              ><small
                                ><span
                                  class="badge"
                                  [class]="
                                    c.type === 'Income' ? 'success' : 'danger'
                                  "
                                  >{{ c.type }}</span
                                >
                                {{ c.rows }} new row{{
                                  c.rows === 1 ? '' : 's'
                                }}
                                · {{ categoryNote(c) }}</small
                              >
                            </div>
                            <app-select
                              class="sel"
                              [options]="categoryOptions()[c.type]"
                              [value]="categoryMap()[catKey(c)] || auto"
                              [searchable]="true"
                              (valueChange)="mapCategory(c, $event)"
                              ariaLabel="Map category"
                            />
                          </div>
                        }
                      </div>
                      <app-paginator
                        [total]="catTable.total()"
                        [page]="catTable.currentPage()"
                        [pageSize]="catTable.pageSize()"
                        [sizes]="[5, 10, 25]"
                        (pageChange)="catTable.setPage($event)"
                        (pageSizeChange)="catTable.setPageSize($event)"
                      />
                    }
                  }
                }
              }
            </section>

            <div class="actions">
              <label class="check">
                <input
                  type="checkbox"
                  class="checkbox"
                  [checked]="strict()"
                  (change)="strict.set(!strict())"
                />
                <span
                  >Only import if every row is valid<small
                    >Otherwise invalid rows are skipped and the rest is
                    imported.</small
                  ></span
                >
              </label>
              <div class="btns">
                <button
                  type="button"
                  class="btn btn-ghost"
                  (click)="reset()"
                  [disabled]="importing()"
                >
                  <app-icon name="arrow-left" [size]="16" /> Back
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  (click)="runImport()"
                  [disabled]="!canImport() || importing()"
                >
                  @if (importing()) {
                    <app-spinner [size]="16" />
                    {{
                      progress() < 100
                        ? 'Uploading ' + progress() + '%'
                        : 'Importing…'
                    }}
                  } @else {
                    <app-icon name="check" [size]="18" /> Import
                    {{ num(p.newRows) }} transaction{{
                      p.newRows === 1 ? '' : 's'
                    }}
                  }
                </button>
              </div>
              @if (blockReason(); as why) {
                <p class="why">{{ why }}</p>
              }
            </div>
          }
        }

        <!-- ============================== 3. done ============================== -->
        @if (step() === 'done') {
          @if (result(); as r) {
            <section class="card card-pad done">
              <div class="tick">
                <app-icon name="check" [size]="38" [stroke]="3" />
              </div>
              <h2>Import complete</h2>
              <p>
                <b>{{ num(r.batch.importedRows) }}</b> transaction{{
                  r.batch.importedRows === 1 ? '' : 's'
                }}
                added from
                <span class="truncate fname">{{ r.batch.fileName }}</span
                >.
              </p>
              <div class="chips center-row">
                <span class="chip"
                  >{{ num(r.batch.duplicateRows) }} duplicates skipped</span
                >
                <span class="chip">{{ num(r.batch.invalidRows) }} invalid</span>
                @if (r.accountsCreated) {
                  <span class="chip"
                    >{{ r.accountsCreated }} new account{{
                      r.accountsCreated === 1 ? '' : 's'
                    }}</span
                  >
                }
                @if (r.categoriesCreated) {
                  <span class="chip"
                    >{{ r.categoriesCreated }} new categor{{
                      r.categoriesCreated === 1 ? 'y' : 'ies'
                    }}</span
                  >
                }
              </div>
              <div class="cta">
                <a routerLink="/analytics/overview" class="btn btn-primary"
                  ><app-icon name="chart" [size]="18" /> Explore analytics</a
                >
                <a routerLink="/transactions" class="btn btn-secondary"
                  ><app-icon name="list" [size]="18" /> View transactions</a
                >
                <button
                  type="button"
                  class="btn btn-ghost"
                  (click)="undo(r.batch)"
                  [disabled]="undoing() !== null"
                >
                  <app-icon name="refresh" [size]="16" /> Undo
                </button>
                <button type="button" class="btn btn-ghost" (click)="reset()">
                  Import another file
                </button>
              </div>
            </section>
          }
        }

        <!-- ============================== history ============================== -->
        <section class="card card-pad history">
          <div class="card-head">
            <div>
              <h3 class="card-title">
                <app-icon name="clock" [size]="18" /> Import history
              </h3>
              <p class="card-sub">
                Undo removes a batch and every transaction it created
              </p>
            </div>
            <app-search-box
              class="srch"
              [value]="history.search()"
              (valueChange)="history.setSearch($event)"
              placeholder="Search files"
            />
          </div>

          @if (batches.error(); as e) {
            <app-error-state [error]="e" (retry)="refresh.bump()" />
          } @else {
            @if (batches.data(); as list) {
              @if (list.length === 0) {
                <app-empty-state
                  icon="upload"
                  title="No imports yet"
                  message="Files you import will be listed here, so you can see exactly what came from where."
                />
              } @else if (history.total() === 0) {
                <app-empty-state
                  icon="search"
                  title="No files match"
                  message="Try a different search."
                  ><button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    (click)="history.setSearch('')"
                  >
                    Clear search
                  </button></app-empty-state
                >
              } @else {
                <div class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>
                          <app-sort-header
                            label="File"
                            key="file"
                            [sort]="history.sort()"
                            (toggle)="history.toggleSort($event)"
                          />
                        </th>
                        <th class="hide-mobile">
                          <app-sort-header
                            label="Imported"
                            key="date"
                            [sort]="history.sort()"
                            (toggle)="history.toggleSort($event)"
                          />
                        </th>
                        <th class="right">
                          <app-sort-header
                            label="Added"
                            key="added"
                            align="right"
                            [sort]="history.sort()"
                            (toggle)="history.toggleSort($event)"
                          />
                        </th>
                        <th class="right hide-mobile">Duplicates</th>
                        <th class="right hide-tablet">Invalid</th>
                        <th style="width: 84px"></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (
                        b of history.pageItems();
                        track b.id;
                        let i = $index
                      ) {
                        <tr [style.--i]="i">
                          <td>
                            <div class="cell-main">
                              <strong>{{ b.fileName }}</strong
                              ><small
                                >{{ b.format
                                }}<span class="show-mobile">
                                  · {{ dt(b.createdAt) }}</span
                                ></small
                              >
                            </div>
                          </td>
                          <td class="nowrap hide-mobile">
                            {{ dt(b.createdAt) }}
                          </td>
                          <td class="right num">
                            <span class="badge success">{{
                              num(b.importedRows)
                            }}</span>
                          </td>
                          <td class="right num hide-mobile">
                            {{ num(b.duplicateRows) }}
                          </td>
                          <td class="right num hide-tablet">
                            {{ num(b.invalidRows) }}
                          </td>
                          <td class="right">
                            <button
                              type="button"
                              class="btn btn-ghost btn-sm"
                              (click)="undo(b)"
                              [disabled]="undoing() !== null"
                            >
                              @if (undoing() === b.id) {
                                <app-spinner [size]="14" />
                              } @else {
                                <app-icon name="refresh" [size]="14" />
                              }
                              Undo
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <app-paginator
                  [total]="history.total()"
                  [page]="history.currentPage()"
                  [pageSize]="history.pageSize()"
                  (pageChange)="history.setPage($event)"
                  (pageSizeChange)="history.setPageSize($event)"
                />
              }
            } @else {
              <div class="stack">
                <app-skeleton height="52px" /><app-skeleton height="52px" />
              </div>
            }
          }
        </section>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        max-width: 100%;
      }
      .page {
        overflow-x: clip;
      }
      .imp {
        container-type: inline-size;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 16px;
        min-width: 0;
      }
      .imp > * {
        min-width: 0;
      }
      .head h1 {
        font-size: clamp(1.4rem, 5.6vw, 1.95rem);
        font-weight: 800;
        line-height: 1.15;
      }
      .head p {
        color: var(--muted);
        margin-top: 4px;
      }
      .block {
        display: block;
      }

      .steps {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .steps li {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 0;
        padding: 8px 10px;
        border-radius: 999px;
        background: var(--surface);
        border: 1px solid var(--border);
        color: var(--faint);
        font-weight: 600;
        font-size: 0.84rem;
        transition: all 0.3s;
      }
      .steps li span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .steps b {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        flex: none;
        border-radius: 50%;
        background: var(--surface-2);
        font-size: 0.78rem;
      }
      .steps li.on {
        color: var(--text);
        border-color: var(--primary);
      }
      .steps li.on b {
        color: #fff;
        background: var(--grad);
      }
      .steps li.done {
        color: var(--success);
      }
      .steps li.done b {
        background: color-mix(in srgb, var(--success) 20%, transparent);
        color: var(--success);
      }

      .drop {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        text-align: center;
        padding: clamp(28px, 7vw, 60px) 16px;
        border-radius: 22px;
        cursor: pointer;
        min-width: 0;
        border: 2px dashed var(--border-strong);
        background: var(--surface);
        transition:
          border-color 0.25s,
          background 0.25s,
          transform 0.25s;
      }
      .drop:hover,
      .drop:focus-visible {
        border-color: var(--primary);
        background: color-mix(in srgb, var(--primary) 7%, transparent);
      }
      .drop.over {
        border-color: var(--primary-2);
        background: color-mix(in srgb, var(--primary) 14%, transparent);
        transform: scale(1.01);
      }
      .drop.busy {
        cursor: progress;
        pointer-events: none;
      }
      .drop h3 {
        font-size: 1.15rem;
        max-width: 100%;
      }
      .drop p {
        color: var(--muted);
      }
      .drop app-progress {
        width: min(360px, 100%);
      }
      .art {
        display: grid;
        place-items: center;
        width: 68px;
        height: 68px;
        border-radius: 22px;
        color: #fff;
        background: var(--grad);
        box-shadow: 0 16px 40px -12px var(--primary);
        animation: float 3.5s ease-in-out infinite;
      }
      .link {
        color: var(--primary-2);
        font-weight: 650;
        text-decoration: underline;
      }
      .alert {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 12px;
        font-size: 0.9rem;
        color: var(--danger);
        background: color-mix(in srgb, var(--danger) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
        animation: fadeUp 0.3s both;
        overflow-wrap: anywhere;
      }
      .settings {
        display: grid;
        gap: 16px;
        grid-template-columns: minmax(0, 1fr);
      }
      .help {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
        padding: 14px;
        border-radius: 14px;
        background: var(--surface-2);
      }
      .help p {
        color: var(--muted);
        font-size: 0.86rem;
        line-height: 1.6;
        margin-top: 4px;
      }
      .tips {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 10px;
        color: var(--muted);
        font-size: 0.88rem;
      }
      .tips li {
        display: flex;
        align-items: flex-start;
        gap: 10px;
      }
      .tips app-icon {
        color: var(--primary-2);
        margin-top: 2px;
      }

      .filebar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
      }
      .fi {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .fi small {
        color: var(--faint);
        font-size: 0.78rem;
      }
      .banner {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        flex-wrap: wrap;
        padding: 14px 16px;
        border-radius: 16px;
        animation: fadeUp 0.35s both;
      }
      .banner > div {
        display: flex;
        flex-direction: column;
        font-size: 0.9rem;
        flex: 1;
        min-width: 200px;
      }
      .banner span {
        color: var(--muted);
      }
      .banner.danger {
        color: var(--danger);
        background: color-mix(in srgb, var(--danger) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--danger) 28%, transparent);
      }
      .banner.info {
        color: var(--info);
        background: color-mix(in srgb, var(--info) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--info) 28%, transparent);
      }
      .banner.warn {
        color: var(--warning);
        background: color-mix(in srgb, var(--warning) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--warning) 28%, transparent);
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 14px;
        min-width: 0;
      }
      .stat span {
        color: var(--muted);
        font-size: 0.84rem;
        font-weight: 600;
      }
      .stat strong {
        font-size: clamp(1.4rem, 7vw, 2rem);
        font-weight: 850;
        letter-spacing: -0.03em;
      }
      .stat small {
        color: var(--faint);
        font-size: 0.76rem;
        overflow-wrap: anywhere;
      }
      .stat.good strong {
        color: var(--success);
      }
      .stat.bad strong {
        color: var(--danger);
      }
      .rechecking {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
      }

      .panel {
        overflow: hidden;
      }
      .tabs {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        margin: -4px -4px 14px;
        padding: 4px;
      }
      .tabs::-webkit-scrollbar {
        display: none;
      }
      .tabs button {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 38px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--muted);
        font: inherit;
        font-weight: 650;
        font-size: 0.86rem;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .tabs button:hover {
        color: var(--text);
        border-color: var(--border-strong);
      }
      .tabs button.on {
        color: #fff;
        border-color: transparent;
        background: var(--grad);
        box-shadow: 0 8px 20px -10px var(--primary);
      }
      .tabs em {
        font-style: normal;
        font-size: 0.72rem;
        font-weight: 800;
        padding: 1px 8px;
        border-radius: 999px;
        background: color-mix(in srgb, currentColor 18%, transparent);
      }
      .tabs em.bad {
        background: var(--danger);
        color: #fff;
      }
      .tools {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
        margin-bottom: 12px;
      }
      .tools app-search-box {
        flex: 1 1 220px;
        min-width: 0;
      }
      .note {
        color: var(--faint);
        font-size: 0.84rem;
        margin: 0 0 12px;
      }
      .wrap {
        white-space: normal;
        overflow-wrap: anywhere;
      }
      td .cell-main small.wrap {
        white-space: normal;
      }
      .sub {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        margin: 18px 0 10px;
        font-size: 0.95rem;
      }
      .sub span {
        color: var(--faint);
        font-weight: 500;
        font-size: 0.8rem;
      }
      .maprows {
        display: grid;
        gap: 10px;
      }
      .maprow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px 16px;
        flex-wrap: wrap;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: var(--surface);
      }
      .who {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1 1 200px;
      }
      .who small {
        color: var(--faint);
        font-size: 0.78rem;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }
      .sel {
        flex: 1 1 240px;
        min-width: 0;
        max-width: 100%;
      }

      .actions {
        position: sticky;
        bottom: 12px;
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px 16px;
        flex-wrap: wrap;
        padding: 12px 14px;
        border-radius: 18px;
        background: color-mix(in srgb, var(--panel-solid) 92%, transparent);
        backdrop-filter: blur(16px);
        border: 1px solid var(--border-strong);
        box-shadow: var(--shadow-lg);
      }
      .check {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        cursor: pointer;
        flex: 1 1 260px;
        min-width: 0;
      }
      .check span {
        display: flex;
        flex-direction: column;
        font-weight: 600;
        font-size: 0.9rem;
      }
      .check small {
        color: var(--faint);
        font-weight: 400;
        font-size: 0.78rem;
      }
      .btns {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        flex: 1 1 280px;
        justify-content: flex-end;
      }
      .btns .btn-primary {
        flex: 1 1 200px;
        max-width: 100%;
      }
      .why {
        flex: 1 1 100%;
        margin: 0;
        color: var(--warning);
        font-size: 0.84rem;
        text-align: right;
      }

      .done {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 10px;
        padding: clamp(28px, 6vw, 54px) 16px;
      }
      .tick {
        display: grid;
        place-items: center;
        width: 84px;
        height: 84px;
        border-radius: 50%;
        color: #fff;
        background: linear-gradient(135deg, #10b981, #34d399);
        animation:
          pop 0.5s cubic-bezier(0.2, 1.4, 0.4, 1) both,
          pulseRing 1.6s 0.4s 2;
      }
      .done h2 {
        font-size: 1.7rem;
        font-weight: 800;
      }
      .done p {
        color: var(--muted);
        max-width: 100%;
      }
      .fname {
        display: inline-block;
        max-width: 100%;
        vertical-align: bottom;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .center-row {
        justify-content: center;
      }
      .cta {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: center;
        margin-top: 10px;
      }
      .srch {
        min-width: min(280px, 100%);
      }

      @container (min-width: 720px) {
        .settings {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .stats {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
        }
        .stat {
          padding: 18px;
        }
      }
      @media (max-width: 767.98px) {
        .actions {
          bottom: calc(var(--bottom-h) + 22px + env(safe-area-inset-bottom));
        }
        .btns {
          justify-content: stretch;
        }
        .btns .btn {
          flex: 1 1 140px;
        }
        .why {
          text-align: left;
        }
      }
      @media (max-width: 380px) {
        .steps li {
          padding: 8px 6px;
          font-size: 0.78rem;
          gap: 5px;
        }
        .steps b {
          width: 20px;
          height: 20px;
        }
      }
    `,
  ],
})
export class ImportsComponent {
  private readonly api = inject(ImportsApi);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly refData = inject(ReferenceDataService);
  protected readonly refresh = inject(RefreshService);

  protected readonly auto = AUTO;
  protected readonly deviceZone = TIME_ZONE;
  protected readonly zones = buildZones();
  protected readonly modes: SegmentOption[] = [
    { value: 'Exact', label: 'Exact' },
    { value: 'Smart', label: 'Smart' },
    { value: 'Loose', label: 'Loose' },
  ];
  protected readonly num = (n: number): string => formatNumber(n);

  protected readonly step = signal<Step>('upload');
  protected readonly tab = signal<Tab>('new');
  protected readonly file = signal<File | null>(null);
  protected readonly timeZone = signal<string>(TIME_ZONE);
  protected readonly matchMode = signal<ImportMatchMode>('Smart');
  protected readonly strict = signal(false);
  protected readonly dragging = signal(false);
  protected readonly analyzing = signal(false);
  protected readonly importing = signal(false);
  protected readonly progress = signal(0);
  protected readonly problem = signal<string | null>(null);
  protected readonly preview = signal<ImportPreviewDto | null>(null);
  protected readonly result = signal<ImportResultDto | null>(null);
  protected readonly undoing = signal<string | null>(null);
  protected readonly accountMap = signal<Readonly<Record<string, string>>>({});
  protected readonly categoryMap = signal<Readonly<Record<string, string>>>({});

  protected readonly batches = asyncState<ImportBatchDto[]>();

  private previewSub?: Subscription;
  private importSub?: Subscription;

  protected readonly modeHelp = computed(() => MODE_HELP[this.matchMode()]);
  protected readonly accountOptions = computed<SelectOption[]>(() => [
    { value: AUTO, label: 'Create or match by name' },
    ...this.refData.accountOptions(),
  ]);
  protected readonly categoryOptions = computed<
    Record<'Expense' | 'Income', SelectOption[]>
  >(() => ({
    Expense: [
      { value: AUTO, label: 'Create or match by name' },
      ...this.refData.categoryOptions('Expense'),
    ],
    Income: [
      { value: AUTO, label: 'Create or match by name' },
      ...this.refData.categoryOptions('Income'),
    ],
  }));

  protected readonly mappedAccountCount = computed(
    () => Object.keys(this.accountMap()).length,
  );
  protected readonly mappedCategoryCount = computed(
    () => Object.keys(this.categoryMap()).length,
  );
  protected readonly mappedCount = computed(
    () => this.mappedAccountCount() + this.mappedCategoryCount(),
  );

  protected readonly blockReason = computed<string | null>(() => {
    const p = this.preview();
    if (!p || this.importing()) return null;
    if (this.analyzing()) return 'Re-checking the file…';
    if (p.fileAlreadyImported)
      return 'This file was already imported. Undo that import first to import it again.';
    if (p.newRows === 0) return 'There is nothing new to import.';
    if (this.strict() && p.invalidRows > 0)
      return `${p.invalidRows} invalid row${p.invalidRows === 1 ? '' : 's'} block the import. Turn the option off to skip them instead.`;
    return null;
  });
  protected readonly canImport = computed(
    () => this.preview() !== null && this.blockReason() === null,
  );

  protected readonly newTable = new TableState<ImportRowSampleDto>(
    () => this.preview()?.sampleNewRows ?? [],
    {
      searchText: (r) =>
        `${r.description ?? ''} ${r.category} ${r.subcategory ?? ''} ${r.account}`,
      comparers: {
        date: (a, b) => a.localTimestamp.localeCompare(b.localTimestamp),
        amount: (a, b) => compareNumber(a.amount, b.amount),
        category: (a, b) => compareText(a.category, b.category),
      },
      defaultSort: { key: 'date', dir: 'desc' },
      pageSize: 10,
    },
  );

  protected readonly dupTable = new TableState<DuplicateRowDto>(
    () => this.preview()?.duplicateSamples ?? [],
    {
      searchText: (r) => `${r.description ?? ''} ${r.reason}`,
      comparers: {
        date: (a, b) => a.localTimestamp.localeCompare(b.localTimestamp),
        amount: (a, b) => compareNumber(a.amount, b.amount),
      },
      defaultSort: { key: 'date', dir: 'desc' },
      pageSize: 10,
    },
  );

  protected readonly invalidTable = new TableState<InvalidRowDto>(
    () => this.preview()?.invalidSamples ?? [],
    {
      searchText: (r) => `${r.rowNumber} ${r.reason}`,
      comparers: {
        row: (a, b) => compareNumber(a.rowNumber, b.rowNumber),
        reason: (a, b) => compareText(a.reason, b.reason),
      },
      defaultSort: { key: 'row', dir: 'asc' },
      pageSize: 10,
    },
  );

  protected readonly warnTable = new TableState<ImportWarningDto>(
    () => this.preview()?.warnings ?? [],
    {
      searchText: (r) => `${r.rowNumber} ${r.message}`,
      comparers: {
        row: (a, b) => compareNumber(a.rowNumber, b.rowNumber),
        message: (a, b) => compareText(a.message, b.message),
      },
      defaultSort: { key: 'row', dir: 'asc' },
      pageSize: 10,
    },
  );

  protected readonly acctTable = new TableState<FileAccountDto>(
    () => this.preview()?.fileAccounts ?? [],
    {
      searchText: (a) => a.name,
      pageSize: 5,
    },
  );

  protected readonly catTable = new TableState<FileCategoryDto>(
    () => this.preview()?.fileCategories ?? [],
    {
      searchText: (c) => `${c.name} ${c.type}`,
      pageSize: 5,
    },
  );

  protected readonly history = new TableState<ImportBatchDto>(
    () => this.batches.data() ?? [],
    {
      searchText: (b) => `${b.fileName} ${b.format}`,
      comparers: {
        file: (a, b) => compareText(a.fileName, b.fileName),
        date: (a, b) => a.createdAt.localeCompare(b.createdAt),
        added: (a, b) => compareNumber(a.importedRows, b.importedRows),
      },
      defaultSort: { key: 'date', dir: 'desc' },
      storageKey: 'imports',
    },
  );

  constructor() {
    autoLoad(this.batches, () => {
      this.refresh.version();
      return this.api.list();
    });

    inject(DestroyRef).onDestroy(() => {
      this.previewSub?.unsubscribe();
      this.importSub?.unsubscribe();
    });
  }

  /** Warn before the tab is closed or reloaded while an import is running. */
  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.importing()) event.preventDefault();
  }

  protected date(value: string | null): string {
    return value ? formatDate(value) : '';
  }

  protected dt(value: string): string {
    return formatDateTime(value);
  }

  protected bytes(size: number): string {
    return size < 1024 * 1024
      ? `${Math.max(1, Math.round(size / 1024))} KB`
      : `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected catKey(c: FileCategoryDto): string {
    return `${c.type}|${c.name}`;
  }

  protected accountNote(a: FileAccountDto): string {
    if (this.accountMap()[a.name]) return 'mapped by you';
    return a.matchedAccountId
      ? 'matches an existing account'
      : 'will be created';
  }

  protected categoryNote(c: FileCategoryDto): string {
    if (this.categoryMap()[this.catKey(c)]) return 'mapped by you';
    return c.matchedCategoryId
      ? 'matches an existing category'
      : 'will be created';
  }

  // ------------------------------------------------------------------ file selection

  protected onDrag(event: DragEvent, over: boolean): void {
    event.preventDefault();
    if (!this.analyzing()) this.dragging.set(over);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.analyzing()) return;

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      this.problem.set('Drop one file at a time.');
      return;
    }
    this.choose(files[0]);
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.choose(file);
  }

  protected reset(): void {
    if (this.importing()) return;
    this.previewSub?.unsubscribe();
    this.step.set('upload');
    this.tab.set('new');
    this.file.set(null);
    this.preview.set(null);
    this.result.set(null);
    this.problem.set(null);
    this.progress.set(0);
    this.analyzing.set(false);
    this.accountMap.set({});
    this.categoryMap.set({});
  }

  private choose(file: File): void {
    this.problem.set(null);

    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
      this.problem.set(
        'Only Excel (.xlsx) and CSV (.csv) files are supported.',
      );
      return;
    }
    if (file.size === 0) {
      this.problem.set('That file is empty.');
      return;
    }
    if (file.size > MAX_BYTES) {
      this.problem.set(
        'That file is larger than 10 MB. Split it into smaller files.',
      );
      return;
    }

    this.file.set(file);
    this.accountMap.set({});
    this.categoryMap.set({});
    this.runPreview(true);
  }

  // ------------------------------------------------------------------ settings

  protected setMode(value: string): void {
    const mode: ImportMatchMode =
      value === 'Exact' || value === 'Loose' ? value : 'Smart';
    if (mode === this.matchMode()) return;
    this.matchMode.set(mode);
    if (this.step() === 'review') this.runPreview(false);
  }

  protected setTimeZone(value: string | number | null): void {
    if (typeof value !== 'string' || !value || value === this.timeZone())
      return;
    this.timeZone.set(value);
    if (this.step() === 'review') this.runPreview(false);
  }

  private runPreview(first: boolean): void {
    const file = this.file();
    if (!file) return;

    this.previewSub?.unsubscribe(); // a newer check always replaces an older one
    this.problem.set(null);
    this.analyzing.set(true);
    this.progress.set(0);

    this.previewSub = this.api
      .preview(file, { timeZone: this.timeZone(), matchMode: this.matchMode() })
      .subscribe({
        next: (event) => {
          this.progress.set(event.progress);
          if (!event.result) return;

          this.preview.set(event.result);
          this.pruneMappings(event.result);
          this.analyzing.set(false);
          if (first) {
            this.tab.set(
              event.result.newRows > 0
                ? 'new'
                : event.result.invalidRows > 0
                  ? 'invalid'
                  : 'duplicates',
            );
            this.step.set('review');
          }
        },
        error: (err: unknown) => {
          this.analyzing.set(false);
          this.problem.set(ApiError.from(err).message);
          if (first) {
            this.file.set(null);
            this.preview.set(null);
          }
        },
      });
  }

  // ------------------------------------------------------------------ mapping

  protected mapAccount(name: string, value: string | number | null): void {
    const next = { ...this.accountMap() };
    if (typeof value === 'string' && value) next[name] = value;
    else delete next[name];
    this.accountMap.set(next);
  }

  protected mapCategory(
    category: FileCategoryDto,
    value: string | number | null,
  ): void {
    const key = this.catKey(category);
    const next = { ...this.categoryMap() };
    if (typeof value === 'string' && value) next[key] = value;
    else delete next[key];
    this.categoryMap.set(next);
  }

  /** Forget mappings for names that are no longer in the file (after a re-check). */
  private pruneMappings(p: ImportPreviewDto): void {
    const accounts = new Set(p.fileAccounts.map((a) => a.name));
    const categories = new Set(p.fileCategories.map((c) => this.catKey(c)));
    this.accountMap.update((m) =>
      Object.fromEntries(Object.entries(m).filter(([k]) => accounts.has(k))),
    );
    this.categoryMap.update((m) =>
      Object.fromEntries(Object.entries(m).filter(([k]) => categories.has(k))),
    );
  }

  // ------------------------------------------------------------------ import and undo

  protected async runImport(): Promise<void> {
    const file = this.file();
    const p = this.preview();
    if (!file || !p || !this.canImport() || this.importing()) return;

    const newAccounts = p.fileAccounts.filter(
      (a) => a.matchedAccountId === null && !this.accountMap()[a.name],
    ).length;
    const ok = await this.confirm.confirm({
      title: `Import ${this.num(p.newRows)} transaction${p.newRows === 1 ? '' : 's'}?`,
      message:
        `${this.num(p.duplicateRows)} duplicate and ${this.num(p.invalidRows)} invalid rows will be skipped.` +
        (newAccounts > 0
          ? `\n${newAccounts} new account${newAccounts === 1 ? '' : 's'} will be created.`
          : '') +
        '\nYou can undo the import afterwards from the history.',
      confirmText: 'Import',
      tone: 'primary',
    });
    if (!ok) return;

    const accounts = this.accountMap();
    const categories = this.categoryMap();
    const hasMappings =
      Object.keys(accounts).length > 0 || Object.keys(categories).length > 0;

    this.previewSub?.unsubscribe();
    this.problem.set(null);
    this.importing.set(true);
    this.progress.set(0);

    this.importSub = this.api
      .import(file, {
        timeZone: this.timeZone(),
        matchMode: this.matchMode(),
        mappings: hasMappings
          ? { accounts: { ...accounts }, categories: { ...categories } }
          : null,
      })
      .subscribe({
        next: (event) => {
          this.progress.set(event.progress);
          if (!event.result) return;

          this.result.set(event.result);
          this.step.set('done');
          this.importing.set(false);
          this.toast.success(
            `Imported ${event.result.batch.importedRows} transactions.`,
          );
          this.refData.load().subscribe();
          this.refresh.bump();
        },
        error: (err: unknown) => {
          this.importing.set(false);
          const e = ApiError.from(err);
          this.problem.set(e.message);
          if (e.code === 'invalid_mapping') this.tab.set('mapping');
          if (
            e.code === 'file_already_imported' ||
            e.code === 'concurrency_conflict' ||
            e.code === 'duplicate_value'
          )
            this.runPreview(false);
        },
      });
  }

  protected async undoPrevious(batch: ImportBatchDto): Promise<void> {
    if (await this.deleteBatch(batch)) this.runPreview(false);
  }

  protected async undo(batch: ImportBatchDto): Promise<void> {
    if ((await this.deleteBatch(batch)) && this.step() === 'done') this.reset();
  }

  private async deleteBatch(batch: ImportBatchDto): Promise<boolean> {
    if (this.undoing() !== null) return false;

    const ok = await this.confirm.confirm({
      title: 'Undo this import?',
      message: `This permanently removes the ${batch.importedRows} transactions imported from “${batch.fileName}”, including any you edited. You can import the file again afterwards.`,
      confirmText: 'Undo import',
      tone: 'danger',
    });
    if (!ok) return false;

    this.undoing.set(batch.id);
    return new Promise<boolean>((resolve) => {
      this.api.delete(batch.id).subscribe({
        next: () => {
          this.undoing.set(null);
          this.toast.success('Import undone.');
          this.refData.load().subscribe();
          this.refresh.bump();
          resolve(true);
        },
        error: () => {
          this.undoing.set(null);
          resolve(false);
        },
      });
    });
  }

  // ------------------------------------------------------------------ downloads

  protected downloadSample(): void {
    downloadBlob(
      buildCsv(
        [
          'Period',
          'Accounts',
          'Category',
          'Subcategory',
          'Note',
          'Income/Expense',
          'Description',
          'Amount',
          'Currency',
        ],
        [
          [
            '2026-09-29 16:36:35',
            'Cash',
            'Food',
            'Snacks',
            '',
            'Exp.',
            'Tea and biscuits',
            55.65,
            'INR',
          ],
          [
            '2026-09-28 09:00:00',
            'HDFC Savings',
            'Salary',
            '',
            'September',
            'Income',
            'Monthly salary',
            50000,
            'INR',
          ],
          [
            '2026-09-27 20:15:00',
            'Cash',
            'Transportation',
            '',
            '',
            'Exp.',
            'Auto to station',
            120,
            'INR',
          ],
        ],
      ),
      'expense-tracker-import-sample.csv',
    );
  }

  protected downloadInvalid(p: ImportPreviewDto): void {
    downloadBlob(
      buildCsv(
        ['Row', 'Reason'],
        p.invalidSamples.map((r) => [r.rowNumber, r.reason]),
      ),
      'import-invalid-rows.csv',
    );
  }

  protected downloadDuplicates(p: ImportPreviewDto): void {
    downloadBlob(
      buildCsv(
        [
          'Row',
          'Date',
          'Type',
          'Amount',
          'Currency',
          'Description',
          'Why it is a duplicate',
        ],
        p.duplicateSamples.map((r) => [
          r.rowNumber,
          r.localTimestamp,
          r.type,
          r.amount,
          r.currency,
          r.description,
          r.reason,
        ]),
      ),
      'import-duplicates.csv',
    );
  }

  protected downloadWarnings(p: ImportPreviewDto): void {
    downloadBlob(
      buildCsv(
        ['Row', 'Warning'],
        p.warnings.map((r) => [r.rowNumber, r.message]),
      ),
      'import-warnings.csv',
    );
  }
}
