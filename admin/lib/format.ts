export const TZ = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Asia/Dhaka';

export const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };

// sv-SE formats as 2026-10-28 14:05:09, which sorts and reads like a log line.
const stampFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TZ,
  dateStyle: 'short',
  timeStyle: 'medium',
});
const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const stamp = (iso: string) => stampFmt.format(new Date(iso));
export const clock = (iso: string) => clockFmt.format(new Date(iso));

// Every date in a "YYYY-MM" month. Built on UTC noon so no zone can push a day
// over the edge.
export function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

// 0 is Sunday. Friday is the weekend day in Bangladesh, which is where the report greys out.
export const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function hoursBetween(from: string, to: string): string {
  const mins = Math.round((Date.parse(to) - Date.parse(from)) / 60000);
  return mins < 0 ? '' : `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
}
