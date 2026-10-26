export type OutreachRow = {
  user_id: string;
  username: string;
  status: "not_contacted" | "messaged";
};

export type OutreachProfile = { username: string; rest_id: string | null };

export function messagedCreatorUsernames(rows: OutreachRow[], profiles: OutreachProfile[]): string[] {
  const byUsername = new Map(profiles.map(profile => [profile.username.toLowerCase(), profile]));
  const byId = new Map(profiles.filter(profile => profile.rest_id).map(profile => [profile.rest_id, profile]));
  const messaged = new Set<string>();
  for (const row of rows) {
    if (row.status !== "messaged") continue;
    const current = byId.get(row.user_id);
    if (current) messaged.add(current.username.toLowerCase());

    const username = row.username.toLowerCase();
    const profile = byUsername.get(username);
    // A handle can be renamed or recycled. A known, different ID must not
    // inherit the previous owner's message history.
    if (!profile?.rest_id || profile.rest_id === row.user_id) messaged.add(username);
  }
  return [...messaged];
}
