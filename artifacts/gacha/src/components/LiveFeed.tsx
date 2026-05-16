import { useState, useEffect } from "react";
import { useGetFeed, getGetFeedQueryKey } from "@workspace/api-client-react";
import { socket } from "@/lib/socket";
import { FeedEntry } from "@workspace/api-client-react/src/generated/api.schemas";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function LiveFeed() {
  const { data: initialFeed, isLoading } = useGetFeed();
  const queryClient = useQueryClient();
  
  useEffect(() => {
    const handlePullEvent = (data: FeedEntry) => {
      // Opt to update local state optimistically or invalidate
      queryClient.setQueryData<FeedEntry[]>(getGetFeedQueryKey(), (old = []) => {
        return [data, ...old].slice(0, 50); // keep last 50
      });
    };

    socket.on("pull-event", handlePullEvent);
    return () => {
      socket.off("pull-event", handlePullEvent);
    };
  }, [queryClient]);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Connecting to live feed...</div>;
  }

  const rarityBadge = {
    legendary: "bg-yellow-500/20 text-yellow-500 border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.3)]",
    epic: "bg-purple-500/20 text-purple-400 border-purple-500/50",
    rare: "bg-blue-500/20 text-blue-400 border-blue-500/50",
    common: "bg-gray-500/20 text-gray-400 border-gray-500/50",
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2 text-primary uppercase tracking-widest font-black text-sm mb-6">
        <Zap className="w-4 h-4 animate-pulse" />
        Live Pulls
      </div>
      
      <div className="space-y-3">
        {initialFeed?.map((entry, i) => (
          <div 
            key={`${entry.timestamp}-${i}`} 
            className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-white/5 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <div className="flex items-center gap-3">
              <span className="font-bold text-sm text-gray-300">{entry.username}</span>
              <span className="text-muted-foreground text-xs">pulled</span>
              <div className="flex items-center gap-2">
                <span className="text-xl leading-none">{entry.card.flag}</span>
                <span className="font-bold text-white text-sm">{entry.card.name}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border",
                rarityBadge[entry.card.rarity as keyof typeof rarityBadge] || rarityBadge.common
              )}>
                {entry.card.rarity}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {formatDistanceToNow(entry.timestamp, { addSuffix: true })}
              </span>
            </div>
          </div>
        ))}
        {(!initialFeed || initialFeed.length === 0) && (
          <div className="text-center p-8 text-muted-foreground border border-dashed border-card-border rounded-xl">
            Waiting for players to pull...
          </div>
        )}
      </div>
    </div>
  );
}