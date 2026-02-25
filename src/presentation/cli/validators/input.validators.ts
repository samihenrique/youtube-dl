const YOUTUBE_URL_REGEX =
  /^https?:\/\/(www\.)?(youtube\.com|m\.youtube\.com|music\.youtube\.com|youtu\.be)\//i;

const BITRATE_REGEX = /^\d+(?:\.\d+)?\s*[kmKM]$/;

const TIMECODE_REGEX = /^\d{1,2}:\d{2}:\d{2}$/;

const RESOLUTION_PRESET_REGEX = /^\d+p$/i;
const RESOLUTION_WXH_REGEX = /^\d+x\d+$/i;

export function validateUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "A URL é obrigatória";
  if (!YOUTUBE_URL_REGEX.test(trimmed)) {
    return "URL inválida. Use um link do YouTube (youtube.com ou youtu.be)";
  }
  return undefined;
}

export function validateInteger(
  value: string,
  min: number,
  max: number,
  fieldName: string,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return `${fieldName} é obrigatório`;

  const num = Number(trimmed);
  if (!Number.isInteger(num)) {
    return `${fieldName} deve ser um número inteiro`;
  }
  if (num < min || num > max) {
    return `${fieldName} deve ser entre ${min} e ${max}`;
  }
  return undefined;
}

export function validateOptionalInteger(
  value: string,
  min: number,
  max: number,
  fieldName: string,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return validateInteger(trimmed, min, max, fieldName);
}

export function validatePositiveInteger(
  value: string,
  fieldName: string,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const num = Number(trimmed);
  if (!Number.isInteger(num) || num <= 0) {
    return `${fieldName} deve ser um número inteiro positivo`;
  }
  return undefined;
}

export function validateBitrate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (!BITRATE_REGEX.test(trimmed)) {
    return 'Bitrate inválido. Use formato como "5M", "192k" ou "2500K"';
  }
  return undefined;
}

export function validateTimeCode(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (!TIMECODE_REGEX.test(trimmed)) {
    return "Formato inválido. Use HH:MM:SS (ex: 01:30:00)";
  }

  const parts = trimmed.split(":").map(Number);
  const minutes = parts[1]!;
  const seconds = parts[2]!;

  if (minutes > 59) return "Minutos devem ser entre 00 e 59";
  if (seconds > 59) return "Segundos devem ser entre 00 e 59";

  return undefined;
}

export function validateResolution(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (
    !RESOLUTION_PRESET_REGEX.test(trimmed) &&
    !RESOLUTION_WXH_REGEX.test(trimmed)
  ) {
    return 'Resolução inválida. Use formato "1920x1080" ou "720p"';
  }
  return undefined;
}

export function validatePath(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "O diretório é obrigatório";

  if (/[<>"|?*\x00-\x1F]/.test(trimmed)) {
    return "O caminho contém caracteres inválidos";
  }
  return undefined;
}
