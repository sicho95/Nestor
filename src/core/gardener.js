// Jardinier: fusionne les agents existants et importés

export async function gardenerMerge(existing, incoming) {
  const byId = new Map(existing.map((a) => [a.id, a]));

  for (const agent of incoming) {
    const cur = byId.get(agent.id);
    if (!cur) {
      byId.set(agent.id, agent);
      continue;
    }
    const merged = { ...cur };
    const newer = (cur.updatedAt || '') < (agent.updatedAt || '') ? agent : cur;
    merged.system_prompt = newer.system_prompt;
    merged.memory_profile = newer.memory_profile || cur.memory_profile;
    merged.backendId = newer.backendId || cur.backendId;
    merged.name = newer.name || cur.name;
    merged.description = newer.description || cur.description;
    merged.tags = newer.tags || cur.tags;
    merged.updatedAt = newer.updatedAt || cur.updatedAt;
    byId.set(agent.id, merged);
  }

  return Array.from(byId.values());
}
