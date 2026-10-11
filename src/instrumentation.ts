import type { Instrumentation } from "next";

// Registra, de forma estruturada e SEM segredos, qualquer erro não tratado de renderização/rotas/ações.
// O `digest` é o mesmo código exibido ao usuário na tela de erro (permite achar a linha no log).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  const { logger } = await import("@/lib/logger");
  logger.error("request_error", { digest: e.digest, message: e.message?.slice(0, 300), method: request.method, path: request.path.split("?")[0], routePath: context.routePath, routeType: context.routeType });
};
