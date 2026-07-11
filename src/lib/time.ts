export function minutesFromSeconds(seconds: number): number {
  return Math.round(seconds / 60);
}

export function secondsFromMinutes(minutes: number): number {
  return minutes * 60;
}
