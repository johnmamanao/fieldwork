import { HttpClient, HttpErrorResponse, HttpInterceptorFn, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, firstValueFrom, throwError } from 'rxjs';
import { Session } from './session';

/** Attaches the bearer token and current workspace, and handles expired sessions. */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(Session);
  const router = inject(Router);
  let headers = req.headers.set('Accept', 'application/json');
  const token = session.token();
  if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  const ws = session.workspace()?.id;
  if (ws && !headers.has('X-Workspace-Id')) headers = headers.set('X-Workspace-Id', String(ws));

  return next(req.clone({ headers })).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.includes('/auth/login')) {
        session.clear();
        router.navigate(['/login'], { queryParams: { expired: 1 } });
      }
      return throwError(() => err);
    }),
  );
};

export type Params = Record<string, string | number | boolean | null | undefined>;

/** Readable message plus field errors from a Laravel validation or abort response. */
export function apiError(err: unknown): { message: string; fields: Record<string, string> } {
  const e = err as HttpErrorResponse;
  const body = e?.error ?? {};
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.errors ?? {})) fields[k] = Array.isArray(v) ? String(v[0]) : String(v);
  let message = body.message || (e?.status === 0 ? 'Cannot reach the server. Check that the Docker services are running.' : 'Something went wrong. Try again.');
  if (e?.status === 403 && !body.message) message = 'You do not have permission to do that.';
  if (e?.status === 404 && !body.message) message = 'That record is not available in this workspace.';
  if (e?.status === 429) { const s = Number(e.headers?.get('Retry-After')) || 60; message = `Too many attempts. Try again in ${s} seconds.`; }
  return { message, fields };
}

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private base = '/api';

  private params(p?: Params): HttpParams {
    let hp = new HttpParams();
    for (const [k, v] of Object.entries(p ?? {})) {
      if (v !== null && v !== undefined && v !== '') hp = hp.set(k, String(v));
    }
    return hp;
  }

  get$<T>(path: string, params?: Params): Observable<T> {
    return this.http.get<T>(this.base + path, { params: this.params(params) });
  }
  get<T>(path: string, params?: Params): Promise<T> {
    return firstValueFrom(this.get$<T>(path, params));
  }
  post<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.base + path, body));
  }
  patch<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.patch<T>(this.base + path, body));
  }
  put<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.put<T>(this.base + path, body));
  }
  delete<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(this.base + path));
  }
  /** Authenticated file download (private storage). */
  async download(path: string, fallbackName: string): Promise<void> {
    const res = await firstValueFrom(this.http.get(this.base + path, { responseType: 'blob', observe: 'response' }));
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
    const url = URL.createObjectURL(res.body as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
