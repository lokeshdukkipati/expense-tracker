import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ImportsApi } from '../../core/api/imports.api';
import { ImportBatchDto, ImportPreviewDto, ImportResultDto, InvalidRowDto } from '../../core/models/api.models';
import { ConfirmService } from '../../core/services/confirm.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { TIME_ZONE } from '../../core/utils/dates';
import { formatDate, formatDateTime, formatNumber } from '../../core/utils/format';
import { TableState, compareNumber, compareText } from '../../core/utils/table-state';
import { ProgressBarComponent } from '../../shared/charts/progress-bar.component';
import { SearchBoxComponent, SortHeaderComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { CountUpComponent, MoneyComponent, MoneyPipe } from '../../shared/ui/money.component';
import { PaginatorComponent } from '../../shared/ui/paginator.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent, SpinnerComponent } from '../../shared/ui/ui-bits.component';

const MAX_BYTES = 10 * 1024 * 1024;

@Component({
  selector: 'app-imports',
  imports: [
    RouterLink, IconComponent, MoneyComponent, MoneyPipe, CountUpComponent, ProgressBarComponent, SearchBoxComponent, SortHeaderComponent, PaginatorComponent,
    EmptyStateComponent, ErrorStateComponent, SkeletonComponent, SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Import</h1><p>Upload your .xlsx export. We preview it first and never import the same row twice.</p></div>
      </div>

      <ol class="steps" aria-label="Import steps">
        <li [class.on]="step() === 'upload'" [class.done]="step() !== 'upload'"><b>1</b> Choose file</li>
        <li [class.on]="step() === 'review'" [class.done]="step() === 'done'"><b>2</b> Review</li>
        <li [class.on]="step() === 'done'"><b>3</b> Done</li>
      </ol>

      @if (step() === 'upload') {
        <section class="card card-pad">
          <div class="drop" [class.over]="dragging()" [class.busy]="analyzing()" tabindex="0" role="button" aria-label="Choose a file to import"
               (click)="picker.click()" (keydown.enter)="picker.click()" (keydown.space)="picker.click(); $event.preventDefault()"
               (dragover)="onDrag($event, true)" (dragleave)="onDrag($event, false)" (drop)="onDrop($event)">
            <input #picker type="file" accept=".xlsx" hidden (change)="onPick($event)" />
            @if (analyzing()) {
              <div class="spin"><app-spinner [size]="34" /></div>
              <h3>Reading {{ file()?.name }}…</h3>
              <app-progress [value]="progress()" tone="primary" />
              <p>{{ progress() < 100 ? 'Uploading ' + progress() + '%' : 'Checking for duplicates…' }}</p>
            } @else {
              <div class="art"><app-icon name="upload" [size]="30" /></div>
              <h3>Drop your Excel file here</h3>
              <p>or <span class="link">browse</span> · .xlsx up to 10 MB</p>
            }
          </div>
          @if (problem(); as p) { <div class="alert" role="alert"><app-icon name="alert-circle" [size]="18" /> {{ p }}</div> }
          <ul class="tips">
            <li><app-icon name="shield" [size]="16" /> Same file twice? Rejected. Overlapping files? Only new rows are added.</li>
            <li><app-icon name="clock" [size]="16" /> Times are read in your time zone ({{ tz }}).</li>
            <li><app-icon name="refresh" [size]="16" /> Changed your mind? Undo any import from the history below.</li>
          </ul>
        </section>
      }

      @if (step() === 'review') {
        @if (preview(); as p) {
          @if (p.fileAlreadyImported) {
            <div class="banner danger"><app-icon name="alert-triangle" [size]="20" /><div><b>This exact file was already imported</b>
              <span>{{ p.previousImport ? 'on ' + dt(p.previousImport.createdAt) : '' }}. Nothing will change. To re-import it, undo that import first.</span></div></div>
          } @else if (p.newRows === 0) {
            <div class="banner info"><app-icon name="check" [size]="20" /><div><b>Everything here is already in your account</b><span>All {{ p.duplicateRows }} valid rows exist already, so there is nothing new to import.</span></div></div>
          }

          <div class="cols-4 reveal stats">
            <div class="card card-pad stat good"><span>New transactions</span><strong><app-count-up [value]="p.newRows" [format]="num" /></strong><small>will be imported</small></div>
            <div class="card card-pad stat"><span>Duplicates</span><strong><app-count-up [value]="p.duplicateRows" [format]="num" /></strong><small>skipped automatically</small></div>
            <div class="card card-pad stat" [class.bad]="p.invalidRows > 0"><span>Invalid rows</span><strong><app-count-up [value]="p.invalidRows" [format]="num" /></strong><small>can't be imported</small></div>
            <div class="card card-pad stat"><span>Rows in file</span><strong><app-count-up [value]="p.totalRows" [format]="num" /></strong>
              <small>{{ p.firstDate ? date(p.firstDate) + ' → ' + date(p.lastDate) : 'no dates' }}</small></div>
          </div>

          <div class="grid-12 section">
            <section class="card card-pad c-4">
              <h3 class="card-title"><app-icon name="wallet" [size]="18" /> What will be added</h3>
              <div class="tot"><div><small>Income</small><b class="text-success num"><app-money [value]="p.newIncomeTotal" /></b></div><div><small>Expenses</small><b class="text-danger num"><app-money [value]="p.newExpenseTotal" /></b></div></div>
              <hr class="divider" />
              <small class="muted">New accounts</small>
              <div class="chips">@for (a of p.newAccounts; track a) { <span class="chip">{{ a }}</span> } @empty { <span class="faint">None, existing accounts match.</span> }</div>
              <small class="muted lbl">New categories</small>
              <div class="chips">@for (c of p.newCategories; track c) { <span class="chip">{{ c }}</span> } @empty { <span class="faint">None, existing categories match.</span> }</div>
            </section>

            <section class="card card-pad c-8">
              <div class="card-head">
                <div><h3 class="card-title"><app-icon name="list" [size]="18" /> Preview of new rows</h3><p class="card-sub">First {{ p.sampleNewRows.length }} of {{ p.newRows }}</p></div>
              </div>
              @if (p.sampleNewRows.length > 0) {
                <div class="table-wrap"><table class="table">
                  <thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="hide-mobile">Account</th><th class="right">Amount</th></tr></thead>
                  <tbody>
                    @for (r of p.sampleNewRows; track r.rowNumber; let i = $index) {
                      <tr [style.--i]="i"><td class="nowrap">{{ dt(r.localTimestamp) }}</td><td>{{ r.description || '—' }}</td>
                        <td>{{ r.subcategory ? r.category + ' › ' + r.subcategory : r.category }}</td><td class="hide-mobile muted">{{ r.account }}</td>
                        <td class="right num" [class.text-success]="r.type === 'Income'">{{ (r.type === 'Income' ? r.amount : -r.amount) | money: '' : r.currency }}</td></tr>
                    }
                  </tbody></table></div>
              } @else { <app-empty-state icon="inbox" title="No new rows to preview" message="Every valid row in this file already exists." /> }
            </section>
          </div>

          @if (p.invalidRows > 0) {
            <section class="card card-pad section">
              <div class="card-head">
                <div><h3 class="card-title"><app-icon name="alert-triangle" [size]="18" /> Rows that can't be imported</h3><p class="card-sub">{{ p.invalidRows }} invalid{{ p.invalidRows > p.invalidSamples.length ? ' (showing the first ' + p.invalidSamples.length + ')' : '' }}</p></div>
                <app-search-box class="srch" [value]="invalid.search()" (valueChange)="invalid.setSearch($event)" placeholder="Search reasons" />
              </div>
              @if (invalid.total() === 0) {
                <app-empty-state icon="search" title="No matches" message="Try a different search."><button type="button" class="btn btn-secondary btn-sm" (click)="invalid.setSearch('')">Clear search</button></app-empty-state>
              } @else {
                <div class="table-wrap"><table class="table">
                  <thead><tr><th style="width: 110px"><app-sort-header label="Row" key="row" [sort]="invalid.sort()" (toggle)="invalid.toggleSort($event)" /></th><th><app-sort-header label="Reason" key="reason" [sort]="invalid.sort()" (toggle)="invalid.toggleSort($event)" /></th></tr></thead>
                  <tbody>@for (r of invalid.pageItems(); track r.rowNumber) { <tr><td class="num">#{{ r.rowNumber }}</td><td>{{ r.reason }}</td></tr> }</tbody></table></div>
                <app-paginator [total]="invalid.total()" [page]="invalid.currentPage()" [pageSize]="invalid.pageSize()" (pageChange)="invalid.setPage($event)" (pageSizeChange)="invalid.setPageSize($event)" />
              }
            </section>
          }

          <div class="actions">
            <button type="button" class="btn btn-ghost" (click)="reset()" [disabled]="importing()"><app-icon name="arrow-left" [size]="16" /> Choose another file</button>
            <button type="button" class="btn btn-primary" (click)="runImport()" [disabled]="importing() || p.fileAlreadyImported || p.newRows === 0">
              @if (importing()) { <app-spinner [size]="16" /> {{ progress() < 100 ? 'Uploading ' + progress() + '%' : 'Importing…' }} } @else { <app-icon name="check" [size]="18" /> Import {{ p.newRows }} new transaction{{ p.newRows === 1 ? '' : 's' }} }
            </button>
          </div>
        }
      }

      @if (step() === 'done') {
        @if (result(); as r) {
          <section class="card card-pad done">
            <div class="tick"><app-icon name="check" [size]="38" [stroke]="3" /></div>
            <h2>Import complete</h2>
            <p><b>{{ r.batch.importedRows }}</b> transaction{{ r.batch.importedRows === 1 ? '' : 's' }} added from {{ r.batch.fileName }}.</p>
            <div class="chips center-row">
              <span class="chip">{{ r.batch.duplicateRows }} duplicates skipped</span><span class="chip">{{ r.batch.invalidRows }} invalid</span>
              @if (r.accountsCreated) { <span class="chip">{{ r.accountsCreated }} new account{{ r.accountsCreated === 1 ? '' : 's' }}</span> }
              @if (r.categoriesCreated) { <span class="chip">{{ r.categoriesCreated }} new categor{{ r.categoriesCreated === 1 ? 'y' : 'ies' }}</span> }
            </div>
            <div class="cta">
              <a routerLink="/analytics/overview" class="btn btn-primary"><app-icon name="chart" [size]="18" /> Explore analytics</a>
              <a routerLink="/transactions" class="btn btn-secondary"><app-icon name="list" [size]="18" /> View transactions</a>
              <button type="button" class="btn btn-ghost" (click)="reset()">Import another file</button>
            </div>
          </section>
        }
      }

      <section class="card card-pad section history">
        <div class="card-head">
          <div><h3 class="card-title"><app-icon name="clock" [size]="18" /> Import history</h3><p class="card-sub">Undo removes a batch and every transaction it created</p></div>
          <app-search-box class="srch" [value]="history.search()" (valueChange)="history.setSearch($event)" placeholder="Search files" />
        </div>

        @if (batches.error(); as e) {
          <app-error-state [error]="e" (retry)="refresh.bump()" />
        } @else {
          @if (batches.data(); as list) {
            @if (list.length === 0) {
              <app-empty-state icon="upload" title="No imports yet" message="Files you import will be listed here, so you can see exactly what came from where." />
            } @else if (history.total() === 0) {
              <app-empty-state icon="search" title="No files match" message="Try a different search."><button type="button" class="btn btn-secondary btn-sm" (click)="history.setSearch('')">Clear search</button></app-empty-state>
            } @else {
              <div class="table-wrap"><table class="table">
                <thead><tr>
                  <th><app-sort-header label="File" key="file" [sort]="history.sort()" (toggle)="history.toggleSort($event)" /></th>
                  <th><app-sort-header label="Imported" key="date" [sort]="history.sort()" (toggle)="history.toggleSort($event)" /></th>
                  <th class="right"><app-sort-header label="Added" key="added" align="right" [sort]="history.sort()" (toggle)="history.toggleSort($event)" /></th>
                  <th class="right hide-mobile">Duplicates</th><th class="right hide-mobile">Invalid</th><th style="width: 70px"></th>
                </tr></thead>
                <tbody>
                  @for (b of history.pageItems(); track b.id; let i = $index) {
                    <tr [style.--i]="i"><td><div class="cell-main"><strong>{{ b.fileName }}</strong><small>{{ b.format }}</small></div></td><td class="nowrap">{{ dt(b.createdAt) }}</td>
                      <td class="right num"><span class="badge success">{{ b.importedRows }}</span></td><td class="right num hide-mobile">{{ b.duplicateRows }}</td><td class="right num hide-mobile">{{ b.invalidRows }}</td>
                      <td class="right"><button type="button" class="btn btn-ghost btn-sm" (click)="undo(b)" [disabled]="undoing() === b.id">@if (undoing() === b.id) { <app-spinner [size]="14" /> } @else { <app-icon name="refresh" [size]="14" /> } Undo</button></td></tr>
                  }
                </tbody></table></div>
              <app-paginator [total]="history.total()" [page]="history.currentPage()" [pageSize]="history.pageSize()" (pageChange)="history.setPage($event)" (pageSizeChange)="history.setPageSize($event)" />
            }
          } @else { <div class="stack"><app-skeleton height="52px" /><app-skeleton height="52px" /></div> }
        }
      </section>
    </div>
  `,
  styles: [`
    .steps { display: flex; gap: 10px; list-style: none; margin: 0 0 18px; padding: 0; flex-wrap: wrap; }
    .steps li { display: inline-flex; align-items: center; gap: 10px; padding: 8px 16px 8px 8px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); color: var(--faint); font-weight: 600; font-size: .88rem; transition: all .3s; }
    .steps b { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--surface-2); font-size: .8rem; }
    .steps li.on { color: var(--text); border-color: var(--primary); } .steps li.on b { color: #fff; background: var(--grad); }
    .steps li.done { color: var(--success); } .steps li.done b { background: color-mix(in srgb, var(--success) 20%, transparent); color: var(--success); }
    .drop { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: clamp(32px, 7vw, 64px) 20px; border-radius: 22px; cursor: pointer;
      border: 2px dashed var(--border-strong); background: var(--surface); transition: border-color .25s, background .25s, transform .25s; }
    .drop:hover, .drop:focus-visible { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 7%, transparent); }
    .drop.over { border-color: var(--primary-2); background: color-mix(in srgb, var(--primary) 14%, transparent); transform: scale(1.01); }
    .drop.busy { cursor: progress; pointer-events: none; }
    .drop h3 { font-size: 1.2rem; } .drop p { color: var(--muted); } .drop app-progress { width: min(360px, 100%); }
    .art { display: grid; place-items: center; width: 72px; height: 72px; border-radius: 24px; color: #fff; background: var(--grad); box-shadow: 0 16px 40px -12px var(--primary); animation: float 3.5s ease-in-out infinite; }
    .link { color: var(--primary-2); font-weight: 650; text-decoration: underline; }
    .alert { display: flex; align-items: flex-start; gap: 10px; margin-top: 14px; padding: 12px 14px; border-radius: 12px; font-size: .9rem; color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); animation: fadeUp .3s both; }
    .tips { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 10px; color: var(--muted); font-size: .9rem; }
    .tips li { display: flex; align-items: center; gap: 10px; } .tips app-icon { color: var(--primary-2); }
    .banner { display: flex; gap: 14px; align-items: flex-start; padding: 14px 16px; border-radius: 16px; margin-bottom: 16px; animation: fadeUp .35s both; }
    .banner div { display: flex; flex-direction: column; font-size: .92rem; } .banner span { color: var(--muted); }
    .banner.danger { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); border: 1px solid color-mix(in srgb, var(--danger) 28%, transparent); }
    .banner.info { color: var(--info); background: color-mix(in srgb, var(--info) 10%, transparent); border: 1px solid color-mix(in srgb, var(--info) 28%, transparent); }
    .stats { margin-bottom: 0; } .stat { display: flex; flex-direction: column; gap: 2px; } .stat span { color: var(--muted); font-size: .86rem; font-weight: 600; }
    .stat strong { font-size: 2rem; font-weight: 850; letter-spacing: -.03em; } .stat small { color: var(--faint); }
    .stat.good strong { color: var(--success); } .stat.bad strong { color: var(--danger); }
    .section { margin-top: 16px; }
    .tot { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; } .tot div { display: flex; flex-direction: column; } .tot b { font-size: 1.15rem; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px; } .lbl { display: block; margin-top: 4px; }
    .srch { min-width: min(280px, 100%); }
    .actions { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 18px; }
    .done { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: clamp(28px, 6vw, 54px) 20px; }
    .tick { display: grid; place-items: center; width: 84px; height: 84px; border-radius: 50%; color: #fff; background: linear-gradient(135deg, #10b981, #34d399); box-shadow: 0 0 0 0 rgba(52, 211, 153, .5); animation: pop .5s cubic-bezier(.2, 1.4, .4, 1) both, pulseRing 1.6s .4s 2; }
    .done h2 { font-size: 1.7rem; font-weight: 800; } .done p { color: var(--muted); } .center-row { justify-content: center; }
    .cta { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 10px; }
  `],
})
export class ImportsComponent {
  private readonly api = inject(ImportsApi);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly refData = inject(ReferenceDataService);
  protected readonly refresh = inject(RefreshService);

  protected readonly tz = TIME_ZONE;
  protected readonly num = (n: number): string => formatNumber(n);

  protected readonly step = signal<'upload' | 'review' | 'done'>('upload');
  protected readonly file = signal<File | null>(null);
  protected readonly dragging = signal(false);
  protected readonly analyzing = signal(false);
  protected readonly importing = signal(false);
  protected readonly progress = signal(0);
  protected readonly problem = signal<string | null>(null);
  protected readonly preview = signal<ImportPreviewDto | null>(null);
  protected readonly result = signal<ImportResultDto | null>(null);
  protected readonly undoing = signal<string | null>(null);

  protected readonly batches = asyncState<ImportBatchDto[]>();

  protected readonly history = new TableState<ImportBatchDto>(() => this.batches.data() ?? [], {
    searchText: (b) => `${b.fileName} ${b.format}`,
    comparers: {
      file: (a, b) => compareText(a.fileName, b.fileName),
      date: (a, b) => a.createdAt.localeCompare(b.createdAt),
      added: (a, b) => compareNumber(a.importedRows, b.importedRows),
    },
    defaultSort: { key: 'date', dir: 'desc' },
    storageKey: 'imports',
  });

  protected readonly invalid = new TableState<InvalidRowDto>(() => this.preview()?.invalidSamples ?? [], {
    searchText: (r) => `${r.rowNumber} ${r.reason}`,
    comparers: { row: (a, b) => compareNumber(a.rowNumber, b.rowNumber), reason: (a, b) => compareText(a.reason, b.reason) },
    defaultSort: { key: 'row', dir: 'asc' },
    pageSize: 10,
  });

  constructor() {
    autoLoad(this.batches, () => {
      this.refresh.version();
      return this.api.list();
    });
  }

  protected date(value: string | null): string {
    return value ? formatDate(value) : '';
  }

  protected dt(value: string): string {
    return formatDateTime(value);
  }

  protected onDrag(event: DragEvent, over: boolean): void {
    event.preventDefault();
    if (!this.analyzing()) this.dragging.set(over);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && !this.analyzing()) this.choose(file);
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.choose(file);
  }

  protected reset(): void {
    this.step.set('upload');
    this.file.set(null);
    this.preview.set(null);
    this.result.set(null);
    this.problem.set(null);
    this.progress.set(0);
  }

  protected runImport(): void {
    const file = this.file();
    if (!file || this.importing()) return;

    this.importing.set(true);
    this.progress.set(0);
    this.api.import(file).subscribe({
      next: (event) => {
        this.progress.set(event.progress);
        if (event.result) {
          this.result.set(event.result);
          this.step.set('done');
          this.importing.set(false);
          this.toast.success(`Imported ${event.result.batch.importedRows} transactions.`);
          this.refData.load().subscribe();
          this.refresh.bump();
        }
      },
      error: () => this.importing.set(false),
    });
  }

  protected async undo(batch: ImportBatchDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Undo this import?',
      message: `This permanently removes the ${batch.importedRows} transactions imported from “${batch.fileName}”, including any you edited. You can import the file again afterwards.`,
      confirmText: 'Undo import',
      tone: 'danger',
    });
    if (!ok) return;

    this.undoing.set(batch.id);
    this.api.delete(batch.id).subscribe({
      next: () => {
        this.undoing.set(null);
        this.toast.success('Import undone.');
        this.refData.load().subscribe();
        this.refresh.bump();
      },
      error: () => this.undoing.set(null),
    });
  }

  private choose(file: File): void {
    this.problem.set(null);
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      this.problem.set('Only Excel (.xlsx) files are supported right now.');
      return;
    }
    if (file.size === 0) {
      this.problem.set('That file is empty.');
      return;
    }
    if (file.size > MAX_BYTES) {
      this.problem.set('That file is larger than 10 MB. Split it into smaller files.');
      return;
    }

    this.file.set(file);
    this.analyzing.set(true);
    this.progress.set(0);

    this.api.preview(file).subscribe({
      next: (event) => {
        this.progress.set(event.progress);
        if (event.result) {
          this.preview.set(event.result);
          this.step.set('review');
          this.analyzing.set(false);
        }
      },
      error: (err: { message?: string }) => {
        this.analyzing.set(false);
        this.file.set(null);
        this.problem.set(err?.message ?? 'The file could not be read.');
      },
    });
  }
}
