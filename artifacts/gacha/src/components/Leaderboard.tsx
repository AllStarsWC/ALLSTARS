import { useGetLeaderboard } from "@workspace/api-client-react";
import { Loader2, Trophy, Medal, Award } from "lucide-react";
import { cn } from "@/lib/utils";

export function Leaderboard() {
  const { data: leaderboard, isLoading } = useGetLeaderboard();

  if (isLoading) {
    return (
      <div className="flex justify-center p-12 text-primary">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-card rounded-xl border border-card-border overflow-hidden">
      <div className="p-4 border-b border-card-border bg-black/20">
        <h2 className="text-xl font-black uppercase tracking-wider flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Top Collectors
        </h2>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-card-border/50 text-muted-foreground text-xs uppercase tracking-wider bg-black/40">
              <th className="px-6 py-4 font-bold">Rank</th>
              <th className="px-6 py-4 font-bold">Player</th>
              <th className="px-6 py-4 font-bold text-right">Legendaries</th>
              <th className="px-6 py-4 font-bold text-right">Total Unique</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard?.map((entry, idx) => (
              <tr 
                key={entry.username}
                className="border-b border-card-border/30 hover:bg-white/5 transition-colors last:border-0"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-black/50 border border-white/5 text-sm font-bold font-mono">
                    {idx === 0 ? <Trophy className="w-4 h-4 text-yellow-500" /> : 
                     idx === 1 ? <Medal className="w-4 h-4 text-gray-400" /> : 
                     idx === 2 ? <Award className="w-4 h-4 text-amber-700" /> : 
                     idx + 1}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "font-bold text-sm",
                    idx === 0 ? "text-primary" : "text-foreground"
                  )}>
                    {entry.username}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="font-mono text-yellow-500 font-bold">{entry.legendaries}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="font-mono text-muted-foreground">{entry.total}</span>
                </td>
              </tr>
            ))}
            {(!leaderboard || leaderboard.length === 0) && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                  No data available yet. Start pulling!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}