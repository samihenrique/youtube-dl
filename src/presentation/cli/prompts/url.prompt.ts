import * as p from "@clack/prompts";
import { validateUrl } from "../validators/input.validators.ts";

export async function promptUrl(): Promise<string> {
  const envUrl = process.env["YOUTUBE_LIVE_URL"]?.trim() ?? "";

  const url = await p.text({
    message: "Qual vídeo você quer baixar?",
    placeholder: "Cola o link do YouTube aqui",
    defaultValue: envUrl || undefined,
    initialValue: envUrl || undefined,
    validate: validateUrl,
  });

  if (p.isCancel(url)) {
    p.cancel("Tudo bem, até a próxima!");
    process.exit(0);
  }

  return url.trim();
}
