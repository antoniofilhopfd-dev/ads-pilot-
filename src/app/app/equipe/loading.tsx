import { LoadingState } from "@/components/state-pages";

// Seguro aqui: estas rotas nunca respondem 404 (um loading.tsx faria o status HTTP de um 404 virar 200).
export default function Loading() {
  return <LoadingState />;
}
