import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import {
  ELaunchKeys,
  ELaunchpadKeys,
  ILaunchpad,
  IPaginationPage,
  IQueryParams,
  IRequestOptions,
} from '@models';
import {
  BehaviorSubject,
  Observable,
  Subscription,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { LaunchpadsApiService } from 'src/app/services/launchpads/launchpads-api.service';
import { IQuery, IQueryOrValue } from '@models/query.model';
import { LaunchpadComponent } from './launchpad/launchpad.component';
import { LoaderService } from 'src/app/services/loader.service';

@Component({
  selector: 'app-launchpads',
  standalone: true,
  imports: [
    LaunchpadComponent,
    CommonModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './launchpads.component.html',
  styleUrl: './launchpads.component.sass',
})
export class LaunchpadsComponent implements OnInit, OnDestroy {
  public launchpads$: Observable<ILaunchpad[]>;

  public readonly filterControl = new FormControl('');
  public readonly totalItems = signal(0);

  private _filterValueChangeSub: Subscription;
  private readonly _queryParams = new BehaviorSubject<IQueryParams>({
    pageSize: 5,
    currentPage: 0,
    filterValue: '',
  });
  private readonly _requestOptions: IRequestOptions<ILaunchpad> = {
    select: [
      ELaunchpadKeys.id,
      ELaunchpadKeys.name,
      ELaunchpadKeys.region,
      ELaunchpadKeys.launches,
    ],
    populate: [
      {
        path: ELaunchpadKeys.launches,
        select: [ELaunchKeys.name, ELaunchKeys.links],
      },
    ],
  };

  constructor(
    private readonly _launchpadsApiService: LaunchpadsApiService,
    private readonly _loaderService: LoaderService
  ) {}

  public async ngOnInit(): Promise<void> {
    this.launchpads$ = this._getLaunchpadsObs();
    this._filterValueChangeSub = this._getFilterValueChangeSub();
  }

  public ngOnDestroy(): void {
    if (this._filterValueChangeSub) this._filterValueChangeSub.unsubscribe();
  }

  public handlePageChange(event: PageEvent): void {
    const currentParams = this._queryParams.value;
    this._queryParams.next({
      ...currentParams,
      currentPage: event.pageIndex + 1,
      pageSize: event.pageSize,
    });
  }

  private _getLaunchpadsObs(): Observable<ILaunchpad[]> {
    return this._queryParams.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      switchMap(
        (params: IQueryParams): Observable<IPaginationPage<ILaunchpad>> => {
          const query: IQuery<ILaunchpad> = {};
          if (params.filterValue?.length) {
            const value: IQueryOrValue = {
              $regex: params.filterValue,
              $options: 'i',
            };
            query.$or = [{ name: value }, { region: value }];
          }

          if (params.pageSize) this._requestOptions.limit = params.pageSize;
          if (params.currentPage) {
            this._requestOptions.page = params.currentPage;
          }
          this._loaderService.show();

          return this._launchpadsApiService
            .getLaunchpads(query, this._requestOptions)
            .pipe(
              tap(() => this._loaderService.hide()),
              catchError((error) => {
                console.error('Error fetching launchpads:', error);
                this._loaderService.hide();
                return of({ docs: [], totalDocs: 0 });
              })
            );
        }
      ),
      tap((page: IPaginationPage<ILaunchpad>) => {
        this.totalItems.set(page.totalDocs);
      }),
      map((page) => page.docs)
    );
  }

  private _getFilterValueChangeSub(): Subscription {
    return this.filterControl.valueChanges.pipe().subscribe((filterValue) => {
      this._queryParams.next({
        ...this._queryParams.value,
        currentPage: 1,
        filterValue: filterValue ?? '',
      });
    });
  }
}
