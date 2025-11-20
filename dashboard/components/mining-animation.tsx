'use client';

import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface MiningAnimationProps {
  isActive: boolean;
  status?: 'mining' | 'waiting' | 'idle';
  className?: string;
}

export function MiningAnimation({ isActive, status = 'idle', className }: MiningAnimationProps) {
  const [activeSquares, setActiveSquares] = useState<Set<number>>(new Set());
  const [primarySquare, setPrimarySquare] = useState<number | null>(null);

  useEffect(() => {
    if (status === 'idle') {
      setActiveSquares(new Set());
      setPrimarySquare(null);
      return;
    }

    // Different animation speeds based on status
    const animationSpeed = status === 'mining' ? 400 : 800; // Slower when waiting

    // Animate squares
    const interval = setInterval(() => {
      const newActive = new Set<number>();
      // Fewer active squares when waiting (1-3 vs 3-7)
      const count = status === 'mining'
        ? Math.floor(Math.random() * 5) + 3
        : Math.floor(Math.random() * 3) + 1;

      for (let i = 0; i < count; i++) {
        newActive.add(Math.floor(Math.random() * 25));
      }
      setActiveSquares(newActive);

      // Set primary square only when actually mining
      if (status === 'mining') {
        setPrimarySquare(Math.floor(Math.random() * 25));
      } else {
        setPrimarySquare(null);
      }
    }, animationSpeed);

    return () => clearInterval(interval);
  }, [status]);

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
                status === 'mining'
                  ? isPrimary
                    ? "bg-blue-500/80 border-2 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.8)]"
                    : isActivated
                    ? "bg-green-500/60 border border-green-500/80 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                    : "bg-gray-800/40 border border-gray-700/30"
                  : status === 'waiting'
                  ? isActivated
                    ? "bg-yellow-500/50 border border-yellow-500/70 shadow-[0_0_6px_rgba(234,179,8,0.5)]"
                    : "bg-gray-800/30 border border-gray-700/30"
                  : "bg-gray-900/30 border border-gray-800/20"
              )}
            >
              {isPrimary && status === 'mining' && (
                <div className="absolute inset-0 bg-blue-400/20 rounded-[2px] animate-pulse" />
              )}
            </div>
          );
        })}
      </div>
      <div className="text-center mt-2">
        <span className={cn(
          "text-[10px] font-bold tracking-wider uppercase transition-colors",
          status === 'mining' ? "text-green-500 animate-pulse" :
          status === 'waiting' ? "text-yellow-500" :
          "text-muted-foreground"
        )}>
          {status === 'mining' ? "⚡ MINING" :
           status === 'waiting' ? "⏳ WAITING" :
           "IDLE"}
        </span>
      </div>
    </div>
  );
}
