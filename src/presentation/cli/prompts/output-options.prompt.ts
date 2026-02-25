import * as p from "@clack/prompts";
import { FilenamePattern } from "../../../domain/enums/filename-pattern.ts";
import { OverwriteBehavior } from "../../../domain/enums/overwrite-behavior.ts";

export interface OutputOptions {
  outputDir: string;
  filenamePattern: FilenamePattern;
  overwrite: OverwriteBehavior;
}

function validateOutputDir(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "O diretório é obrigatório";
  if (/[<>"|?*\x00-\x1F]/.test(trimmed)) {
    return "O caminho contém caracteres inválidos";
  }
  return undefined;
}

export async function promptOutputOptions(): Promise<OutputOptions> {
  const results = await p.group(
    {
      outputDir: () =>
        p.text({
          message: "Diretório de saída:",
          initialValue: "./downloads",
          validate: validateOutputDir,
        }),
      filenamePattern: () =>
        p.select({
          message: "Padrão do nome do arquivo:",
          options: [
            {
              value: FilenamePattern.TitleId,
              label: "título-id",
              hint: "Meu Vídeo-dQw4w9WgXcQ.mp4",
            },
            {
              value: FilenamePattern.IdTitle,
              label: "id-título",
              hint: "dQw4w9WgXcQ-Meu Vídeo.mp4",
            },
            {
              value: FilenamePattern.TitleOnly,
              label: "apenas título",
              hint: "Meu Vídeo.mp4",
            },
          ],
        }),
      overwrite: () =>
        p.select({
          message: "Se o arquivo já existir:",
          options: [
            {
              value: OverwriteBehavior.Rename,
              label: "Renomear",
              hint: "adiciona (1), (2)... ao nome",
            },
            {
              value: OverwriteBehavior.Overwrite,
              label: "Sobrescrever",
            },
            {
              value: OverwriteBehavior.Skip,
              label: "Pular",
              hint: "não baixa novamente",
            },
          ],
        }),
    },
    {
      onCancel: () => {
        p.cancel("Operação cancelada.");
        process.exit(0);
      },
    },
  );

  return {
    outputDir: results.outputDir,
    filenamePattern: results.filenamePattern,
    overwrite: results.overwrite,
  };
}
