import { cacheLife, cacheTag } from "next/cache";
import { supabase } from "./supabase";
import { messagedCreatorUsernames, type OutreachProfile, type OutreachRow } from "./outreach-status";

async function fetchRows<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await supabase(`${path}&offset=${offset}&limit=1000`);
    const page: T[] = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function getMessagedCreatorUsernames(): Promise<string[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("creator-outreach", "authors");
  const [outreach, profiles] = await Promise.all([
    fetchRows<OutreachRow>("creator_outreach?select=user_id,username,status&status=eq.messaged&order=user_id.asc"),
    fetchRows<OutreachProfile>("author_profiles?select=username,rest_id&order=username.asc"),
  ]);
  return messagedCreatorUsernames(outreach, profiles);
}
