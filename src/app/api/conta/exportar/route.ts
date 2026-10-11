import { NextResponse } from "next/server";
import { currentUser } from "@/server/session";
import { exportUserData } from "@/server/services/account";

export async function GET() {
  const user = await currentUser();
  if (!user) return new NextResponse("Não autenticado", { status: 401 });
  const data = await exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="meus-dados-adspilot.json"', "Cache-Control": "no-store" },
  });
}
