import * as p from "@clack/prompts";
import { validateUrl } from "../validators/input.validators.ts";

export async function promptUrl(): Promise<string> {
  const envUrl = process.env["YOUTUBE_LIVE_URL"]?.trim() ?? "";

  const url = await p.text({
    message: "Cole a URL do YouTube:",
    placeholder: "https://youtube.com/watch?v=...",
    defaultValue: envUrl || undefined,
    initialValue: envUrl || undefined,
    validate: validateUrl,
  });

  if (p.isCancel(url)) {
    p.cancel("Operação cancelada.");
    process.exit(0);
  }

  return url;
}
