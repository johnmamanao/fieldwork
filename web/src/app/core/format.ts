import { Pipe, PipeTransform, inject } from '@angular/core';
import { Session } from './session';

const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$' };

export function formatMoney(cents: number | null | undefined, currency = 'USD', compact = false): string {
  if (cents === null || cents === undefined) return '—';
  const value = cents / 100;
  const sym = SYMBOL[currency] ?? currency + ' ';
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (compact && abs >= 10000) {
    const k = abs >= 1_000_000 ? (abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1) + 'M' : (abs / 1000).toFixed(abs >= 100_000 ? 0 : 1) + 'k';
    return `${sign}${sym}${k}`;
  }
  // Compact figures (KPIs, axes) read in whole units beside "$164k"; full amounts keep their cents.
  const digits = compact ? 0 : 2;
  return `${sign}${sym}${abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatHours(minutes: number | null | undefined, decimals = 1): string {
  if (minutes === null || minutes === undefined) return '—';
  return (minutes / 60).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Parses "1:30", "1.5", "90m" into minutes. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+):(\d{1,2})$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = s.match(/^(\d+)\s*m$/))) return Number(m[1]);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h?$/))) return Math.round(Number(m[1]) * 60);
  return null;
}

export function formatDate(value: string | null | undefined, style: 'short' | 'long' | 'day' = 'short', tz?: string): string {
  if (!value) return '—';
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = isDateOnly ? new Date(value + 'T12:00:00Z') : new Date(value);
  const opts: Intl.DateTimeFormatOptions =
    style === 'long' ? { month: 'long', day: 'numeric', year: 'numeric' }
      : style === 'day' ? { weekday: 'short', month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric', year: d.getUTCFullYear() !== new Date().getUTCFullYear() ? 'numeric' : undefined };
  return d.toLocaleDateString('en-US', { ...opts, timeZone: isDateOnly ? 'UTC' : tz });
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return '—';
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(value);
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function label(value: string | null | undefined): string {
  if (!value) return '—';
  // Aging buckets arrive as "1_30", "31-60", "90_plus" or "current".
  const range = /^(\d+)\s*[-‐‑‒–—_]\s*(\d+)$/.exec(value);
  if (range) return `${range[1]}–${range[2]} days`;
  const plus = /^(\d+)\s*(?:[-‐‑‒–—_]\s*plus|\+)$/i.exec(value);
  if (plus) return `${plus[1]}+ days`;
  const s = value.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  private session = inject(Session);
  transform(cents: number | null | undefined, currency?: string, compact = false): string {
    return formatMoney(cents, currency ?? this.session.currency(), compact);
  }
}

@Pipe({ name: 'hours' })
export class HoursPipe implements PipeTransform {
  transform(minutes: number | null | undefined, decimals = 1): string {
    return formatHours(minutes, decimals);
  }
}

@Pipe({ name: 'day' })
export class DayPipe implements PipeTransform {
  private session = inject(Session);
  transform(value: string | null | undefined, style: 'short' | 'long' | 'day' = 'short'): string {
    return formatDate(value, style, this.session.timezone());
  }
}

@Pipe({ name: 'ago' })
export class AgoPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatRelative(value);
  }
}

@Pipe({ name: 'label' })
export class LabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return label(value);
  }
}

@Pipe({ name: 'initials' })
export class InitialsPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return initials(value);
  }
}

export const FORMAT_PIPES = [MoneyPipe, HoursPipe, DayPipe, AgoPipe, LabelPipe, InitialsPipe];
