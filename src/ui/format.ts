/** 1234567 → "1,234,567", without relying on Intl being available in Hermes. */
export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** plural(1, 'song') → "1 song"; plural(3, 'song') → "3 songs". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

/** 185.6 → "3:05"; 3725 → "1:02:05". Garbage in (NaN, negative) → "0:00". */
export function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
