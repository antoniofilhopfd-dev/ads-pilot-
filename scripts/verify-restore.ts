// Prova que o banco RESTAURADO é equivalente ao original e funciona no app: contagens e CHECKSUM por tabela,
// login com o hash restaurado e descriptografia do token da Meta.
// Uso: SOURCE_URL=... RESTORE_URL=... EMAIL=... PASSWORD=... EXPECT_TOKEN=... tsx scripts/verify-restore.ts
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import { decryptSecret, verifyPassword } from "../src/lib/crypto";

async function main() {
  const { RESTORE_URL, SOURCE_URL, EMAIL, PASSWORD, EXPECT_TOKEN } = process.env as Record<string, string>;
  const [src, dst] = [await mysql.createConnection(SOURCE_URL), await mysql.createConnection(RESTORE_URL)];
  const tables = async (c: mysql.Connection) => {
    const [t] = (await c.query("SELECT table_name AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type='BASE TABLE' ORDER BY 1")) as [{ n: string }[], unknown];
    const out: Record<string, { rows: number; checksum: number | null }> = {};
    for (const { n } of t) {
      const [[r]] = (await c.query(`SELECT COUNT(*) AS c FROM \`${n}\``)) as [{ c: number }[], unknown];
      const [[k]] = (await c.query(`CHECKSUM TABLE \`${n}\``)) as [{ Checksum: number | null }[], unknown];
      out[n] = { rows: Number(r.c), checksum: k.Checksum === null ? null : Number(k.Checksum) };
    }
    return out;
  };
  const [a, b] = [await tables(src), await tables(dst)];
  assert.ok(Object.keys(a).length >= 15, `deve cobrir todas as tabelas (obtido ${Object.keys(a).length})`);
  assert.deepEqual(b, a);
  const total = Object.values(a).reduce((s, x) => s + x.rows, 0);
  console.log(`✔ ${Object.keys(a).length} tabelas, ${total} linhas: contagem e CHECKSUM idênticos entre original e restaurado`);

  const [[u]] = (await dst.query("SELECT password_hash FROM users WHERE email = ?", [EMAIL])) as [{ password_hash: string }[], unknown];
  assert.ok(u, "usuário restaurado"); assert.ok(await verifyPassword(PASSWORD, u.password_hash)); console.log("✔ senha do usuário restaurado confere (hash íntegro)");

  const [[c]] = (await dst.query("SELECT token_enc FROM meta_connections WHERE mode = 'meta' AND token_enc IS NOT NULL LIMIT 1")) as [{ token_enc: string }[], unknown];
  assert.ok(c, "conexão com token cifrado restaurada");
  assert.equal(decryptSecret(c.token_enc), EXPECT_TOKEN); console.log("✔ token da Meta restaurado abre com a ENCRYPTION_KEY original");
  const good = process.env.ENCRYPTION_KEY; process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  assert.throws(() => decryptSecret(c.token_enc)); process.env.ENCRYPTION_KEY = good; console.log("✔ com outra chave o token NÃO abre (guarde a chave em cofre separado)");
  await src.end(); await dst.end();
}
main().then(() => process.exit(0)).catch((e) => { console.error("VERIFICAÇÃO FALHOU:", e.message); process.exit(1); });
