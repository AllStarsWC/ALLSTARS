import { useState } from "react";
import { useGetCards, useGetCollection } from "@workspace/api-client-react";
import { CardItem } from "./CardItem";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function Collection({ username }: { username: string }) {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: allCards, isLoading: cardsLoading } = useGetCards();
  const { data: ownedIds, isLoading: collLoading } = useGetCollection(username);

  if (cardsLoading || collLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
        <p className="uppercase tracking-widest text-sm">Loading Vault...</p>
      </div>
    );
  }

  const ownedSet = new Set(ownedIds || []);
  
  let displayedCards = allCards || [];
  
  if (filter !== "all") {
    displayedCards = displayedCards.filter(c => c.rarity === filter);
  }

  if (search.trim()) {
    const s = search.toLowerCase();
    displayedCards = displayedCards.filter(c => 
      c.name.toLowerCase().includes(s) || 
      c.country.toLowerCase().includes(s)
    );
  }

  const filters = ["all", "legendary", "epic", "rare", "common"];

  const progress = ownedSet.size;
  const total = allCards?.length || 100;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-wider text-white">Vault Progress</h2>
          <div className="flex items-center gap-3 mt-1">
            <div className="h-2 w-48 bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary" 
                style={{ width: `${(progress / total) * 100}%` }}
              />
            </div>
            <span className="font-mono text-sm text-muted-foreground">{progress} / {total}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search cards..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 w-[200px] bg-black/50"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map(f => (
          <Badge 
            key={f}
            variant="outline"
            className={cn(
              "cursor-pointer uppercase tracking-wider hover:bg-secondary",
              filter === f ? "bg-primary text-primary-foreground border-primary hover:bg-primary" : "text-muted-foreground border-gray-800"
            )}
            onClick={() => setFilter(f)}
          >
            {f}
          </Badge>
        ))}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
        {displayedCards.map((card) => {
          const isOwned = ownedSet.has(card.id);
          return (
            <div key={card.id} className="relative group">
              <CardItem 
                card={card} 
                isFlipped={isOwned} 
                locked={!isOwned} 
                className={cn(
                  "transition-all duration-300",
                  isOwned ? "hover:scale-105 hover:z-10" : ""
                )}
              />
              {!isOwned && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                   <div className="text-[10px] uppercase font-bold text-gray-500 bg-black/80 px-2 py-1 rounded">Locked</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}