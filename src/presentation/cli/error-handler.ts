import pc from "picocolors";
import { DomainError } from "../../domain/errors/domain-error.ts";

const FRIENDLY_MESSAGES: Record<string, string> = {
  VIDEO_UNAVAILABLE:
    "Não consegui encontrar esse vídeo. Ele pode ser privado, ter sido removido, ou a URL pode estar incorreta.\n  Tenta abrir o link no navegador pra confirmar que ele está acessível.",
  FFMPEG_NOT_FOUND:
    "Pra converter o vídeo, preciso do ffmpeg instalado no seu computador.\n  Instala com: sudo apt install ffmpeg (Linux) ou brew install ffmpeg (Mac).",
  DOWNLOAD_FAILED:
    "O download não foi concluído. Pode ser instabilidade na rede ou o YouTube limitando as requisições.\n  Tenta de novo em alguns minutos.",
  CONVERSION_FAILED:
    "A conversão não deu certo. O arquivo pode estar corrompido ou o codec escolhido não é compatível.\n  Tenta com um formato diferente.",
  INVALID_URL:
    "Essa URL não parece ser do YouTube. Cola o link direto da barra de endereço do navegador\n  — algo como youtube.com/watch?v=...",
  INVALID_INPUT:
    "Algum valor informado não está no formato esperado. Confere e tenta de novo.",
};

export function handleError(error: unknown): void {
  console.log();

  if (error instanceof DomainError) {
    const friendly = FRIENDLY_MESSAGES[error.code];
    if (friendly) {
      console.error(pc.red(`  ${friendly}`));
    } else {
      console.error(pc.red(`  ${error.message}`));
    }

    if (error.cause) {
      const causeMsg =
        error.cause instanceof Error
          ? error.cause.message
          : String(error.cause);
      console.error(pc.dim(`\n  Detalhe técnico: ${causeMsg}`));
    }
  } else if (error instanceof Error) {
    console.error(pc.red(`  Algo deu errado: ${error.message}`));
  } else {
    console.error(pc.red(`  Erro inesperado: ${String(error)}`));
  }

  console.log();
}
