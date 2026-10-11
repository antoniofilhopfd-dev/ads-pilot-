import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const conn = await mysql.createConnection({ uri: url, timezone: "Z" });
  await migrate(drizzle(conn), { migrationsFolder: "./drizzle" });
  await conn.end();
  console.log("Migrações aplicadas.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
