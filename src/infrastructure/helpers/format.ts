const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${BYTE_UNITS[unitIndex]}`;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00:00";

  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return [hours, minutes, secs]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(totalMs: number): string {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return "poucos segundos";

  const totalSeconds = Math.ceil(totalMs / 1000);

  if (totalSeconds < 5) return "poucos segundos";
  if (totalSeconds < 60) return `~${totalSeconds} segundos`;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours === 0) {
    return minutes === 1 ? "~1 minuto" : `~${minutes} minutos`;
  }

  const hourPart = hours === 1 ? "1 hora" : `${hours} horas`;
  if (minutes === 0) return `~${hourPart}`;
  const minPart = minutes === 1 ? "1 minuto" : `${minutes} minutos`;
  return `~${hourPart} e ${minPart}`;
}

export function formatSegmentDuration(segmentCount: number, segmentLengthSec = 5): string {
  const totalSeconds = segmentCount * segmentLengthSec;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours === 0) {
    return minutes === 1 ? "~1 minuto" : `~${minutes} minutos`;
  }

  const hourPart = hours === 1 ? "1 hora" : `${hours} horas`;
  if (minutes === 0) return `~${hourPart}`;
  const minPart = minutes === 1 ? "1 minuto" : `${minutes} minutos`;
  return `~${hourPart} e ${minPart}`;
}
