// Sincroniza as contas selecionadas de todas as organizações com conexão ativa.
// Para agendar (cron da hospedagem, a cada 6 h):  npm run sync
import { closeDb } from "../src/db";
import { runScheduledSync } from "../src/server/jobs/sync-all";

runScheduledSync().then((r) => { console.log(JSON.stringify(r)); return closeDb(); });
