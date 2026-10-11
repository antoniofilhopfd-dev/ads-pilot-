"use client";
import { ErrorState } from "@/components/state-pages";

export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="px-4 py-16"><ErrorState {...props} backHref="/" /></main>;
}
