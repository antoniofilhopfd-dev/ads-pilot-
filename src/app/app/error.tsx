"use client";
import { ErrorState } from "@/components/state-pages";

// Dentro do layout autenticado: menu e cabeçalho continuam visíveis.
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState {...props} />;
}
