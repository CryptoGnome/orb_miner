'use client';

import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { StatusCard } from '@/components/dashboard/status-card';
import { PnLCard } from '@/components/dashboard/pnl-card';
import {
  Wallet,
  Coins,
  TrendingUp,
  Zap,
  Activity,
  DollarSign,
} from 'lucide-react';

async function fetchStatus() {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json();
}

async function fetchPnL() {
  const res = await fetch('/api/pnl');
  if (!res.ok) throw new Error('Failed to fetch PnL');
  return res.json();
}

export default function Home() {
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['status'],
    queryFn: fetchStatus,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const { data: pnl, isLoading: pnlLoading } = useQuery({
    queryKey: ['pnl'],
    queryFn: fetchPnL,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (statusLoading || pnlLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <Zap className="mx-auto h-12 w-12 animate-pulse text-primary" />
            <p className="mt-4 text-lg text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const netPnL = pnl?.netDifference || 0;
  const totalIncome = pnl?.incomeBreakdown?.totalIncome || 0;
  const totalExpenses = pnl?.expenseBreakdown?.totalExpenses || 0;
  const roi = pnl?.roi || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-primary neon-text">
            ORB Mining Dashboard
          </h1>
          <p className="text-muted-foreground">
            Real-time monitoring and analytics
          </p>
        </div>

        {/* PnL Card */}
        <PnLCard
          totalPnL={netPnL}
          roi={roi}
          income={totalIncome}
          expenses={totalExpenses}
        />

        {/* Status Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            title="Wallet SOL"
            value={`${status?.balances?.sol?.toFixed(4) || '0'} SOL`}
            description="Main wallet balance"
            icon={Wallet}
            neonGlow
          />
          <StatusCard
            title="Wallet ORB"
            value={`${status?.balances?.orb?.toFixed(2) || '0'} ORB`}
            description="ORB token balance"
            icon={Coins}
          />
          <StatusCard
            title="Automation Balance"
            value={`${status?.balances?.automationSol?.toFixed(4) || '0'} SOL`}
            description="Bot automation account"
            icon={Zap}
          />
          <StatusCard
            title="ORB Price"
            value={`$${status?.prices?.orbPriceUsd?.toFixed(4) || '0'}`}
            description={`${status?.prices?.orbPriceSol?.toFixed(6) || '0'} SOL`}
            icon={TrendingUp}
          />
        </div>

        {/* Claimable Rewards */}
        <div>
          <h2 className="text-xl font-bold text-foreground mb-4">
            Claimable Rewards
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatusCard
              title="Mining SOL"
              value={`${status?.claimable?.sol?.toFixed(4) || '0'} SOL`}
              description="Ready to claim"
              icon={DollarSign}
            />
            <StatusCard
              title="Mining ORB"
              value={`${status?.claimable?.orb?.toFixed(2) || '0'} ORB`}
              description="Ready to claim"
              icon={Coins}
            />
            <StatusCard
              title="Staking Rewards"
              value={`${status?.claimable?.stakingRewards?.toFixed(2) || '0'} ORB`}
              description="From staked ORB"
              icon={Activity}
            />
          </div>
        </div>

        {/* Current Round Info */}
        <div>
          <h2 className="text-xl font-bold text-foreground mb-4">
            Current Round
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <StatusCard
              title="Round ID"
              value={status?.round?.id || 'N/A'}
              description="Current mining round"
              icon={Activity}
            />
            <StatusCard
              title="Motherload"
              value={`${status?.round?.motherload?.toFixed(2) || '0'} ORB`}
              description="Total prize pool"
              icon={Zap}
              neonGlow
            />
            <StatusCard
              title="Staked ORB"
              value={`${status?.staking?.stakedOrb?.toFixed(2) || '0'} ORB`}
              description="Your staked amount"
              icon={Coins}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
