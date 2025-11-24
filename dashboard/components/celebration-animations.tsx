'use client';

import { useEffect, useState } from 'react';
import Confetti from 'react-confetti';
import { useWindowSize } from '@/hooks/use-window-size';

interface CelebrationAnimationsProps {
  currentRoundId?: string;
  currentMotherlode?: number;
  motherloadThreshold?: number;
  enableNewRoundAnimation?: boolean;
  enableMotherloadAnimation?: boolean;
}

export function CelebrationAnimations({
  currentRoundId,
  currentMotherlode,
  motherloadThreshold = 300,
  enableNewRoundAnimation = true,
  enableMotherloadAnimation = true,
}: CelebrationAnimationsProps) {
  const [prevRoundId, setPrevRoundId] = useState<string | null>(null);
  const [prevMotherlode, setPrevMotherlode] = useState<number>(0);
  const [showRoundConfetti, setShowRoundConfetti] = useState(false);
  const [showMotherloadConfetti, setShowMotherloadConfetti] = useState(false);
  const { width, height } = useWindowSize();

  // Track round changes
  useEffect(() => {
    if (!currentRoundId || !enableNewRoundAnimation) return;

    if (prevRoundId === null) {
      // First load - just set the value
      setPrevRoundId(currentRoundId);
      return;
    }

    if (prevRoundId !== currentRoundId) {
      // New round started!
      console.log(`🎉 New Round Started! Round #${currentRoundId}`);
      setShowRoundConfetti(true);
      setPrevRoundId(currentRoundId);

      // Stop confetti after 5 seconds
      setTimeout(() => setShowRoundConfetti(false), 5000);
    }
  }, [currentRoundId, prevRoundId, enableNewRoundAnimation]);

  // Track motherload milestones
  useEffect(() => {
    if (!currentMotherlode || !enableMotherloadAnimation) return;

    if (prevMotherlode === 0) {
      // First load - just set the value
      setPrevMotherlode(currentMotherlode);
      return;
    }

    // Check if we crossed the threshold (going up)
    const crossedThreshold = prevMotherlode < motherloadThreshold && currentMotherlode >= motherloadThreshold;

    // Check for significant motherload increase (50+ ORB jump)
    const bigIncrease = currentMotherlode - prevMotherlode >= 50;

    if (crossedThreshold || bigIncrease) {
      console.log(`💎 Motherload Milestone! ${currentMotherlode.toFixed(2)} ORB`);
      setShowMotherloadConfetti(true);
      setPrevMotherlode(currentMotherlode);

      // Stop confetti after 7 seconds (longer for motherload)
      setTimeout(() => setShowMotherloadConfetti(false), 7000);
    } else {
      setPrevMotherlode(currentMotherlode);
    }
  }, [currentMotherlode, prevMotherlode, motherloadThreshold, enableMotherloadAnimation]);

  return (
    <>
      {/* New Round Celebration - Neon Blue/Cyan theme */}
      {showRoundConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <Confetti
            width={width}
            height={height}
            recycle={false}
            numberOfPieces={250}
            colors={['#06b6d4', '#0ea5e9', '#22d3ee', '#38bdf8', '#7dd3fc', '#0891b2']}
            gravity={0.25}
          />
          <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center animate-bounce">
            <div className="relative bg-black/80 backdrop-blur-sm border-2 border-cyan-500/50 rounded-lg px-4 py-2.5 shadow-2xl neon-border">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-lg" />
              <div className="relative z-10">
                <h2 className="text-2xl font-black mb-1 bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent neon-text">
                  🎉 NEW ROUND! 🎉
                </h2>
                <p className="text-lg font-bold text-cyan-400">Round #{currentRoundId}</p>
                <div className="mt-1 text-[10px] text-cyan-500/60 uppercase tracking-wider">Round Started</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Motherload Celebration - Neon Emerald/Purple theme */}
      {showMotherloadConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <Confetti
            width={width}
            height={height}
            recycle={false}
            numberOfPieces={350}
            colors={['#10b981', '#22c55e', '#34d399', '#a855f7', '#c084fc', '#e879f9']}
            gravity={0.2}
            initialVelocityY={20}
          />
          <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="relative bg-black/80 backdrop-blur-sm border-4 border-emerald-500/50 rounded-3xl px-14 py-8 shadow-2xl neon-border animate-pulse">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-purple-500/10 to-pink-500/10 rounded-3xl" />
              <div className="relative z-10">
                <h2 className="text-6xl font-black mb-3 bg-gradient-to-r from-emerald-400 via-purple-400 to-pink-400 bg-clip-text text-transparent neon-text">
                  💎 MOTHERLOAD! 💎
                </h2>
                <p className="text-4xl font-bold text-emerald-400 mb-2">{currentMotherlode?.toFixed(2)} ORB</p>
                <div className="mt-3 text-base text-purple-400/80 uppercase tracking-wider">
                  Mining Rewards Are <span className="text-pink-400 font-bold">HOT!</span> 🔥
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
