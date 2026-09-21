import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const source = resolve("site"), output = resolve("dist");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true, filter: (item) => !item.endsWith("config.example.js") });
// A chave anon é deliberadamente pública: as políticas RLS do Supabase controlam os dados.
// As variáveis de ambiente permitem substituí-la sem modificar o código-fonte.
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rnhlokuedpnscfymlwjj.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaGxva3VlZHBuc2NmeW1sd2pqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMTIxMzUsImV4cCI6MjEwNTU4ODEzNX0._4yJdN5ZldFQ_kZ0qQLZvjn4LrTYZICejnE3HQmXM_4";
await writeFile(resolve(output, "config.js"), `window.RANKING_CONFIG = ${JSON.stringify({ SUPABASE_URL: projectUrl, SUPABASE_ANON_KEY: anonKey })};\n`);
