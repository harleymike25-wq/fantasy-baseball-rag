import TeamSelector from "../components/TeamSelector";
import RosterGrid from "../components/RosterGrid";

export default function RosterPage({ teamHook }) {
  const {
    teams, activeTeamId, setActiveTeamId, roster,
    createTeam, renameTeam, deleteTeam, updateSlot, clearSlot,
  } = teamHook;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <TeamSelector
        teams={teams}
        activeTeamId={activeTeamId}
        onSelect={setActiveTeamId}
        onCreate={createTeam}
        onRename={renameTeam}
        onDelete={deleteTeam}
      />

      {!activeTeamId ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 14 }}>
          Create or select a team to build your roster.
        </div>
      ) : (
        <RosterGrid
          roster={roster}
          onSelect={updateSlot}
          onClear={clearSlot}
        />
      )}
    </div>
  );
}
