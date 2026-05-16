import { Card } from "@workspace/api-client-react/src/generated/api.schemas";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface CardItemProps {
  card?: Card;
  isFlipped?: boolean;
  className?: string;
  delay?: number; // Delay for staggering flip animation
  locked?: boolean;
}

export function CardItem({ card, isFlipped = true, className, delay = 0, locked = false }: CardItemProps) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (isFlipped) {
      const timer = setTimeout(() => setFlipped(true), delay);
      return () => clearTimeout(timer);
    } else {
      setFlipped(false);
    }
  }, [isFlipped, delay]);

  const rarityColor = {
    legendary: "glow-legendary from-yellow-900/40 to-yellow-600/10 border-yellow-500",
    epic: "glow-epic from-purple-900/40 to-purple-600/10 border-purple-500",
    rare: "glow-rare from-blue-900/40 to-blue-600/10 border-blue-500",
    common: "glow-common from-gray-800/40 to-gray-600/10 border-gray-500",
  }[card?.rarity || "common"];

  const rarityText = {
    legendary: "text-glow-legendary",
    epic: "text-glow-epic",
    rare: "text-glow-rare",
    common: "text-glow-common",
  }[card?.rarity || "common"];

  if (locked || !card) {
    return (
      <div className={cn("w-full aspect-[2.5/3.5] rounded-xl border-2 border-dashed border-gray-800 bg-gray-900/50 flex flex-col items-center justify-center opacity-50", className)}>
        <div className="text-4xl text-gray-700">?</div>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full aspect-[2.5/3.5] perspective-1000 group", className)}>
      <div
        className={cn(
          "w-full h-full duration-700 preserve-3d relative transition-transform",
          flipped ? "rotate-y-180" : ""
        )}
      >
        {/* Front of card (hidden initially if pulling) */}
        <div className="absolute inset-0 w-full h-full backface-hidden rounded-xl border-2 border-gray-800 bg-gradient-to-br from-gray-900 to-black flex items-center justify-center shadow-lg">
          <div className="text-primary font-bold tracking-widest uppercase border border-primary px-4 py-1 rounded rotate-[-15deg] opacity-70">
            WC 2026
          </div>
        </div>

        {/* Back of card (the actual player face) */}
        <div
          className={cn(
            "absolute inset-0 w-full h-full backface-hidden rounded-xl border-2 rotate-y-180 bg-gradient-to-br flex flex-col items-center p-3 overflow-hidden",
            rarityColor
          )}
        >
          {/* Top Bar */}
          <div className="w-full flex justify-between items-start z-10 relative">
            <div className="text-2xl">{card.flag}</div>
            <div className="text-sm font-bold bg-black/60 px-2 py-0.5 rounded uppercase tracking-wider text-gray-300">
              {card.position}
            </div>
          </div>
          
          {/* Center Graphic */}
          <div className="flex-1 flex items-center justify-center z-10 relative w-full mt-2 mb-2">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-4xl md:text-5xl shadow-inner">
               {card.flag}
            </div>
          </div>

          {/* Bottom Info */}
          <div className="w-full text-center z-10 relative bg-black/80 p-2 rounded-lg border border-white/5 backdrop-blur-sm">
            <h3 className="font-black text-sm md:text-base leading-tight truncate text-white">{card.name}</h3>
            <p className={cn("text-xs font-bold uppercase tracking-widest mt-1", rarityText)}>
              {card.rarity}
            </p>
          </div>
          
          {/* Subtle background texture */}
          <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent pointer-events-none mix-blend-overlay"></div>
        </div>
      </div>
    </div>
  );
}
