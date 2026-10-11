import type { Role } from "@/db/schema";

// Matriz de permissões. Toda checagem acontece no servidor (serviços), nunca só na UI.
export const PERMISSIONS = [
  "org.read",
  "org.settings",
  "members.manage",
  "clients.read",
  "clients.write",
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  manager: ["org.read", "clients.read", "clients.write", "audit.read"],
  analyst: ["org.read", "clients.read"],
};

export const can = (role: Role, p: Permission) => MATRIX[role].includes(p);

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  manager: "Gestor de anúncios",
  analyst: "Analista (leitura)",
};
