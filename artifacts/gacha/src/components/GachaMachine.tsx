import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardItem } from "./CardItem";
import { 
  usePullCard, 
  usePullTenCards, 
  useGetUserStats,
  getGetCollectionQueryKey,
  getGetFeedQueryKey,
  getGetLeaderboardQueryKey,
  getGetUserStatsQueryKey,
  getPullCardQueryKey,
  getPullTenCardsQueryKey
} from "@workspace/api-client-react";
import confetti from "canvas-confetti";
import { Card } from "@workspace/api-client-react/src/generated/api.schemas";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function GachaMachine() {
  const [username, setUsername] = useState(() => localStorage.getItem("gacha_username") || "");
  const [pulling, setPulling] = useState(false);
  const [pulledCards, setPulledCards] = useState<Card[]>([]);
  
  const queryClient = useQueryClient();

  // Save username to local storage when it changes
  useEffect(() => {
    if (username) {
      localStorage.setItem("gacha_username", username);
    }
  }, [username]);

  const { data: statsData, isFetching: statsLoading } = useGetUserStats(
    username,
    { query: { enabled: !!username, queryKey: getGetUserStatsQueryKey(username) } }
  );

  const pull1 = usePullCard(
    { username },
    { query: { enabled: false, queryKey: getPullCardQueryKey({ username }) } }
  );

  const pull10 = usePullTenCards(
    { username },
    { query: { enabled: false, queryKey: getPullTenCardsQueryKey({ username }) } }
  );

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: getGetCollectionQueryKey(username) });
    queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetLeaderboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey(username) });
  };

  const fireConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#fbbf24', '#f59e0b', '#d97706']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#fbbf24', '#f59e0b', '#d97706']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  };

  const handlePull1 = async () => {
    if (!username) return;
    setPulling(true);
    setPulledCards([]);
    
    try {
      const res = await pull1.refetch();
      if (res.data?.card) {
        setPulledCards([res.data.card]);
        invalidateData();
        if (res.data.card.rarity === 'legendary') {
          setTimeout(fireConfetti, 500);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPulling(false);
    }
  };

  const handlePull10 = async () => {
    if (!username) return;
    setPulling(true);
    setPulledCards([]);
    
    try {
      const res = await pull10.refetch();
      if (res.data?.cards) {
        setPulledCards(res.data.cards);
        invalidateData();
        if (res.data.cards.some(c => c.rarity === 'legendary')) {
          setTimeout(fireConfetti, 1000);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPulling(false);
    }
  };

  const isPullingDisabled = pulling || !username || pull1.isFetching || pull10.isFetching;

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-4xl mx-auto py-8">
      {/* User Setup & Stats Strip */}
      <div className="w-full bg-card border border-card-border p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Label htmlFor="username" className="shrink-0 text-muted-foreground uppercase text-xs font-bold tracking-widest">Player ID</Label>
          <Input 
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
            className="w-full md:w-48 bg-black/50 font-mono"
            maxLength={16}
          />
        </div>
        
        {username && (
          <div className="flex items-center gap-6 text-sm">
            {statsLoading ? (
              <div className="flex gap-4">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-24" />
              </div>
            ) : statsData ? (
              <>
                <div className="flex flex-col items-center">
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Total Pulls</span>
                  <span className="font-mono font-bold text-primary">{statsData.pulls}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Unique</span>
                  <span className="font-mono font-bold text-white">{statsData.owned}/100</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Legendary</span>
                  <span className="font-mono font-bold text-yellow-500">{statsData.legendaries}</span>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-4">
        <Button 
          size="lg" 
          onClick={handlePull1} 
          disabled={isPullingDisabled}
          className="w-32 bg-secondary hover:bg-secondary/80 text-white font-bold tracking-wider uppercase border border-white/10"
        >
          {pull1.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Pull x1"}
        </Button>
        <Button 
          size="lg" 
          onClick={handlePull10} 
          disabled={isPullingDisabled}
          className="w-40 bg-primary hover:bg-primary/90 text-primary-foreground font-black tracking-wider uppercase shadow-[0_0_20px_rgba(34,197,94,0.4)]"
        >
          {pull10.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Pull x10"}
        </Button>
      </div>

      {/* Presentation Area */}
      <div className="w-full min-h-[400px] flex items-center justify-center p-4">
        {pulledCards.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center opacity-50">
            <div className="w-24 h-32 border-2 border-dashed border-gray-700 rounded-xl mb-4"></div>
            <p className="uppercase tracking-widest text-sm font-bold">Ready to pull</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 w-full">
            {pulledCards.map((card, idx) => (
              <CardItem 
                key={`${card.id}-${idx}`} 
                card={card} 
                isFlipped={true} 
                delay={idx * 150} // stagger flip for x10
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}