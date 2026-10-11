import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

// Recria o banco de teste do zero e aplica as migrações versionadas (valida as migrações também).
export default async function setup() {
  const base = mysql.createConnection({ host: "localhost", user: "adspilot", password: "adspilot_dev_pw" });
  const c = await base;
  await c.query("DROP DATABASE IF EXISTS adspilot_test");
  await c.query("CREATE DATABASE adspilot_test CHARACTER SET utf8mb4");
  await c.end();
  const conn = await mysql.createConnection({ uri: "mysql://adspilot:adspilot_dev_pw@localhost:3306/adspilot_test", timezone: "Z" });
  await migrate(drizzle(conn), { migrationsFolder: "./drizzle" });
  await conn.end();
}
