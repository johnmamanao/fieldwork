import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';

export interface TimerEntry { id: number; project_id: number; minutes: number; timer_started_at: string; notes?: string; project?: { id: number; name: string; code: string; color?: string }; }

/** The single running timer, shared by the top bar and the Time page. */
@Injectable({ providedIn: 'root' })
export class TimerState {
  private api = inject(Api);
  readonly running = signal<TimerEntry | null>(null);
  private now = signal(Date.now());

  constructor() {
    setInterval(() => this.now.set(Date.now()), 1000);
  }

  readonly elapsedText = computed(() => {
    const t = this.running();
    if (!t) return '';
    const secs = Math.max(0, Math.floor((this.now() - new Date(t.timer_started_at).getTime()) / 1000)) + t.minutes * 60;
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

  async start(body: { project_id: number; task_id?: number | null; notes?: string }): Promise<void> {
    const res = await this.api.post<{ timer: TimerEntry }>('/timer/start', body);
    this.running.set(res.timer);
  }

  async stop(): Promise<{ entry: TimerEntry & { minutes: number } }> {
    const res = await this.api.post<{ entry: TimerEntry & { minutes: number } }>('/timer/stop');
    this.running.set(null);
    return res;
  }
}
