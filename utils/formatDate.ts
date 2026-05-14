export function formatDate(dateString?: string) {
  if (!dateString) return '';

  const date = new Date(dateString);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const time = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) {
    return `Hoy ${time}`;
  }

  return (
    date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    }) + ` · ${time}`
  );
}