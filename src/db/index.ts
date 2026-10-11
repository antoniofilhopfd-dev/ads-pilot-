import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __pool?: mysql.Pool };

function getPool() {
  if (!globalForDb.__pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definida");
    globalForDb.__pool = mysql.createPool({ uri: url, connectionLimit: 10, timezone: "Z" });
  }
  return globalForDb.__pool;
}

export const db = drizzle(getPool(), { schema, mode: "default" });
export const closeDb = () => getPool().end();
export { schema };
