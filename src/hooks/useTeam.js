import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useTeam() {
  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(
    () => localStorage.getItem("activeTeamId") ?? null
  );
  const [roster, setRoster] = useState({});
  const [loading, setLoading] = useState(false);

  const loadTeams = useCallback(async () => {
    const { data } = await supabase
      .from("teams")
      .select("*")
      .order("created_at");
    setTeams(data ?? []);
  }, []);

  const loadRoster = useCallback(async (teamId) => {
    if (!teamId) { setRoster({}); return; }
    const { data } = await supabase
      .from("roster_slots")
      .select("*")
      .eq("team_id", teamId);
    const map = {};
    for (const row of data ?? []) map[row.slot_key] = row;
    setRoster(map);
  }, []);

  useEffect(() => { loadTeams(); }, [loadTeams]);

  useEffect(() => {
    if (activeTeamId) {
      localStorage.setItem("activeTeamId", activeTeamId);
      loadRoster(activeTeamId);
    }
  }, [activeTeamId, loadRoster]);

  async function createTeam(name) {
    setLoading(true);
    const { data, error } = await supabase
      .from("teams")
      .insert({ name })
      .select()
      .single();
    setLoading(false);
    if (error) throw error;
    setTeams((prev) => [...prev, data]);
    setActiveTeamId(data.id);
    return data;
  }

  async function renameTeam(teamId, name) {
    await supabase.from("teams").update({ name }).eq("id", teamId);
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, name } : t)));
  }

  async function deleteTeam(teamId) {
    await supabase.from("teams").delete().eq("id", teamId);
    setTeams((prev) => prev.filter((t) => t.id !== teamId));
    if (activeTeamId === teamId) {
      const remaining = teams.filter((t) => t.id !== teamId);
      const next = remaining[0]?.id ?? null;
      setActiveTeamId(next);
      if (!next) localStorage.removeItem("activeTeamId");
    }
  }

  async function updateSlot(slotKey, playerData) {
    if (!activeTeamId) return;
    const row = {
      team_id: activeTeamId,
      slot_key: slotKey,
      player_id: playerData.id,
      player_name: playerData.name,
      player_team: playerData.team,
      player_position: playerData.position,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("roster_slots").upsert(row, { onConflict: "team_id,slot_key" });
    setRoster((prev) => ({ ...prev, [slotKey]: row }));
  }

  async function clearSlot(slotKey) {
    if (!activeTeamId) return;
    await supabase
      .from("roster_slots")
      .delete()
      .eq("team_id", activeTeamId)
      .eq("slot_key", slotKey);
    setRoster((prev) => {
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });
  }

  function getRosterSummary() {
    return Object.entries(roster)
      .filter(([, v]) => v?.player_name)
      .map(([key, v]) => `${key}: ${v.player_name} (${v.player_team})`)
      .join(", ");
  }

  return {
    teams,
    activeTeamId,
    setActiveTeamId,
    roster,
    loading,
    createTeam,
    renameTeam,
    deleteTeam,
    updateSlot,
    clearSlot,
    getRosterSummary,
  };
}
