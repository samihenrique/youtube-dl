const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatFileSize(bytes: number): string {
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

export function formatFileSizeShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0B";

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  const decimals = value >= 100 ? 0 : 1;
  const unit = BYTE_UNITS[unitIndex];
  return `${value.toFixed(decimals)}${unit ? unit[0] : "B"}`;
}

export function formatTimeFromUs(us: number): string {
  const totalSeconds = Math.floor(us / 1_000_000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatSpeedMultiplier(speed: number | null): string {
  if (speed === null || speed <= 0) return "—";
  if (speed < 1) return `${speed.toFixed(2)}x`;
  if (speed < 10) return `${speed.toFixed(1)}x`;
  return `${Math.round(speed)}x`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  if (value >= 100) return "100%";
  if (value >= 10) return `${value.toFixed(1)}%`;
  return `${value.toFixed(1)}%`;
}

export function formatCpuPercent(percent: number): string {
  if (percent >= 90) return `${Math.round(percent)}%`;
  if (percent >= 70) return `${Math.round(percent)}%`;
  return `${Math.round(percent)}%`;
}

export function formatMemoryMb(usedMb: number, totalMb: number): string {
  const used = formatMbValue(usedMb);
  const total = formatMbValue(totalMb);
  return `${used} / ${total}`;
}

function formatMbValue(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

export function formatEtaFromProgress(
  processedTimeUs: number,
  totalTimeUs: number | null,
  speed: number | null,
): string | null {
  if (totalTimeUs === null || speed === null || speed <= 0) return null;

  const remainingUs = totalTimeUs - processedTimeUs;
  if (remainingUs <= 0) return null;

  const etaSeconds = remainingUs / 1_000_000 / speed;
  if (etaSeconds < 5) return "poucos segundos";
  if (etaSeconds < 60) return `~${Math.round(etaSeconds)}s`;

  const minutes = Math.floor(etaSeconds / 60);
  const seconds = Math.round(etaSeconds % 60);

  if (minutes < 60) {
    return seconds > 0 ? `~${minutes}m ${seconds}s` : `~${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`;
}
