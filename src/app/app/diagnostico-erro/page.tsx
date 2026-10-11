import { notFound } from "next/navigation";

// Rota SOMENTE para testes (E2E do estado de erro). Inexistente (404) quando ENABLE_TEST_ROUTES não está definida.
export const dynamic = "force-dynamic";

export default function DiagnosticoErro() {
  if (process.env.ENABLE_TEST_ROUTES !== "1") notFound();
  throw new Error("Erro de teste proposital (diagnóstico)");
}
