export function toLocalDateParts(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return { year, month, day };
}

export function dateWithTime(dateString, timeString) {
  const { year, month, day } = toLocalDateParts(dateString);
  const [hour, minute] = timeString.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export function formatTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}
