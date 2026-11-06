import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import { formatDuration } from './format';

export interface TimerEntry { id: number; project_id: number; minutes: number; timer_started_at: string; notes?: string; work_date?: string; project?: { id: number; name: string; code: string; color?: string }; }
export interface LoggableProject { id: number; name: string; code: string; color?: string | null; status?: string; billing_model?: string }
export interface StopResult { entry: (TimerEntry & { minutes: number }) | null; discarded?: boolean; seconds: number }

/** Today on this person's own calendar (their device's time zone), as YYYY-MM-DD. */
export function localDay(d = new Date()): string {
  return d.toLocaleDateString('en-CA');
}

/** The single running timer, shared by the top bar and the Time page. */
@Injectable({ providedIn: 'root' })
export class TimerState {
  private api = inject(Api);
  readonly running = signal<TimerEntry | null>(null);
  /** Projects this person can log time to, for the top bar's quick start. */
  readonly projects = signal<LoggableProject[]>([]);
  private now = signal(Date.now());

  constructor() {
    setInterval(() => this.now.set(Date.now()), 1000);
  }

  /** Seconds on the clock: time already on the entry plus the current run. */
  readonly elapsedSeconds = computed(() => {
    const t = this.running();
    if (!t) return 0;
    return Math.max(0, Math.floor((this.now() - new Date(t.timer_started_at).getTime()) / 1000)) + t.minutes * 60;
  });

  /** What the entry would hold if stopped now: the clock rounded to the nearest minute, as the server does. */
  readonly liveMinutes = computed(() => Math.round(this.elapsedSeconds() / 60));

  readonly elapsedText = computed(() => {
    if (!this.running()) return '';
    const secs = this.elapsedSeconds();
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });

  async load(): Promise<void> {
    try {
      const res = await this.api.get<{ timer: TimerEntry | null }>('/timer');
      this.running.set(res.timer);
    } catch { /* not allowed or offline */ }
  }

  /** The loggable projects come with this week's timesheet; fetched once for the quick start. */
  async loadProjects(): Promise<void> {
    try {
      const res = await this.api.get<{ projects: LoggableProject[] }>('/time-entries', { week: localDay() });
      this.projects.set(res.projects);
    } catch { this.projects.set([]); }
  }

  async start(body: { project_id: number; task_id?: number | null; notes?: string }): Promise<void> {
    const res = await this.api.post<{ timer: TimerEntry }>('/timer/start', { ...body, work_date: localDay() });
    this.running.set(res.timer);
  }

  async stop(): Promise<StopResult> {
    const res = await this.api.post<StopResult>('/timer/stop');
    this.running.set(null);
    return res;
  }

  /** The message to show after stopping, so the logged amount always matches what the clock said. */
  stopMessage(r: StopResult): string {
    if (!r.entry) return 'Stopped under 30 seconds, so nothing was logged.';
    return `Logged ${formatDuration(r.entry.minutes)} to ${r.entry.project?.name ?? 'the project'}`;
  }
}
