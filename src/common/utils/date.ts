/** Midnight of the given day in the server's time zone (set TZ=Africa/Tunis in production). */
export function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}
