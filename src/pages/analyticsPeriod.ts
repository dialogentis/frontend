export const utcDay = (day: string) => new Date(`${day}T00:00:00Z`)

export function analyticsPeriod(days: number, time_zone: string) {
  const parts = new Intl.DateTimeFormat('ru', {
    timeZone: time_zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts()
  const to = ['year', 'month', 'day'].map(name => parts.find(part => part.type === name)?.value).join('-')
  const start = utcDay(to)
  start.setUTCDate(start.getUTCDate() - days + 1)
  return { from: start.toISOString().slice(0, 10), to, time_zone }
}
