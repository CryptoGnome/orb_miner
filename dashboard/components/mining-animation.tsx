'use client';

import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface MiningAnimationProps {
  isActive: boolean;
  className?: string;
}

export function MiningAnimation({ isActive, className }: MiningAnimationProps) {
  const [activeSquares, setActiveSquares] = useState<Set<number>>(new Set());
  const [primarySquare, setPrimarySquare] = useState<number | null>(null);

  useEffect(() => {
    if (!isActive) {
      setActiveSquares(new Set());
      setPrimarySquare(null);
      return;
    }

    // Animate squares when mining
    const interval = setInterval(() => {
      const newActive = new Set<number>();
      // Randomly activate 3-7 squares
      const count = Math.floor(Math.random() * 5) + 3;
      for (let i = 0; i < count; i++) {
        newActive.add(Math.floor(Math.random() * 25));
      }
      setActiveSquares(newActive);

      // Set one primary highlighted square (like the blue bordered one on ore.blue)
      setPrimarySquare(Math.floor(Math.random() * 25));
    }, 400);

    return () => clearInterval(interval);
  }, [isActive]);

  return (
    <div className={cn("inline-block", className)}>
      <div className="grid grid-cols-5 gap-[3px] p-2.5 bg-black/60 rounded-lg border border-primary/40">
        {Array.from({ length: 25 }, (_, i) => {
          const isActivated = activeSquares.has(i);
          const isPrimary = primarySquare === i;
          return (
            <div
              key={i}
              className={cn(
                "w-4 h-4 rounded-[2px] transition-all duration-300 relative",
                isActive
                  ? isPrimary
                    ? "bg-blue-500/80 border-2 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.8)]"
                    : isActivated
                    ? "bg-primary/60 border border-primary/80 shadow-[0_0_8px_rgba(var(--primary-rgb),0.6)]"
                    : "bg-gray-800/40 border border-gray-700/30"
                  : "bg-gray-900/30 border border-gray-800/20"
              )}
            >
              {isPrimary && isActive && (
                <div className="absolute inset-0 bg-blue-400/20 rounded-[2px] animate-pulse" />
              )}
            </div>
          );
        })}
      </div>
      <div className="text-center mt-2">
        <span className={cn(
          "text-[10px] font-bold tracking-wider uppercase transition-colors",
          isActive ? "text-primary animate-pulse" : "text-muted-foreground"
        )}>
          {isActive ? "⚡ MINING" : "IDLE"}
        </span>
      </div>
    </div>
  );
}
