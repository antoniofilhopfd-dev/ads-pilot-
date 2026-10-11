"use client";

// Último recurso: falha no próprio layout raiz. Precisa trazer <html>/<body> e não depende de CSS do app.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F5F7FC", color: "#202938", margin: 0 }}>
        <main role="alert" style={{ maxWidth: 480, margin: "80px auto", padding: 32, background: "#fff", border: "1px solid #E4E8F0", borderRadius: 12, textAlign: "center" }}>
          <h1 style={{ fontSize: 18 }}>Algo deu errado</h1>
          <p style={{ color: "#5A6478", fontSize: 14 }}>Não foi possível carregar a aplicação. Tente novamente.</p>
          {error.digest && <p style={{ fontSize: 12, color: "#5A6478" }}>Código do erro: {error.digest}</p>}
          <button onClick={reset} style={{ background: "#243B80", color: "#fff", border: 0, borderRadius: 6, padding: "8px 16px", fontSize: 14, cursor: "pointer" }}>Tentar novamente</button>
        </main>
      </body>
    </html>
  );
}
