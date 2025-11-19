'use client';

import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Wallet,
  Coins,
  TrendingUp,
  TrendingDown,
  Zap,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
    refetchInterval: 10000,
  });

  const { data: pnl, isLoading: pnlLoading } = useQuery({
    queryKey: ['pnl'],
    queryFn: fetchPnL,
    refetchInterval: 30000,
  });

  if (statusLoading || pnlLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <Zap className="h-12 w-12 animate-pulse text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const netPnL = pnl?.summary?.netProfit || 0;
  const roi = pnl?.summary?.roi || 0;
  const isProfit = netPnL >= 0;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Profit & Loss Hero */}
        <Card className="border-primary/50 neon-border">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-start justify-between gap-6">
              {/* Main PnL Display */}
              <div className="flex-1 space-y-4">
                {/* Profit Amount */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Net Profit</h3>
                    <Badge variant="outline" className={cn(isProfit ? "bg-green-500/20 text-green-500 border-green-500/50" : "bg-red-500/20 text-red-500 border-red-500/50")}>
                      {isProfit ? '+' : ''}{roi.toFixed(2)}%
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className={cn("text-5xl font-bold tracking-tight", isProfit ? "text-green-500 neon-text" : "text-red-500")}>
                      {isProfit ? '+' : ''}{netPnL.toFixed(4)}
                    </span>
                    <span className="text-2xl font-semibold text-muted-foreground">SOL</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {(pnl?.truePnL?.startingBalance || 0).toFixed(4)} SOL → {(pnl?.truePnL?.currentBalance || 0).toFixed(4)} SOL
                  </p>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-3 gap-6 pt-4 border-t border-border/50">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">ORB Earned</p>
                    <p className="text-base font-bold text-emerald-500">{(pnl?.breakdown?.income?.orbFromMining || 0).toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">(before 10% fee)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">ORB Claimed</p>
                    <p className="text-base font-bold text-purple-500">{(pnl?.breakdown?.income?.orbSwappedCount || 0).toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">(after 10% fee)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Total Fees</p>
                    <p className="text-base font-bold text-red-500">{(pnl?.summary?.totalExpenses || 0).toFixed(4)} SOL</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">(all costs)</p>
                  </div>
                </div>
              </div>

              {/* Icon */}
              {isProfit ? (
                <TrendingUp className="h-16 w-16 text-green-500 flex-shrink-0" />
              ) : (
                <TrendingDown className="h-16 w-16 text-red-500 flex-shrink-0" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Compact Balances & Info */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Balances */}
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Balances
                </span>
                <Badge variant="outline" className="bg-primary/20 text-primary border-primary/50">
                  {((status?.balances?.sol || 0) + (status?.balances?.automationSol || 0)).toFixed(4)} SOL Total
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Main Wallet</span>
                <div className="text-right">
                  <div className="font-semibold">{status?.balances?.sol?.toFixed(4) || '0'} SOL</div>
                  <div className="text-xs text-muted-foreground">{status?.balances?.orb?.toFixed(2) || '0'} ORB</div>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Automation Bot</span>
                  <Badge variant="outline" className="bg-cyan-500/20 text-cyan-500 border-cyan-500/50 text-xs">
                    {status?.automation?.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="font-semibold">{status?.balances?.automationSol?.toFixed(4) || '0'} SOL</div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm text-muted-foreground">ORB Price</span>
                <div className="text-right flex items-center gap-2">
                  <div>
                    <div className="font-semibold text-primary">${status?.prices?.orbPriceUsd?.toFixed(2) || '0'}</div>
                    <div className="text-xs text-muted-foreground">{status?.prices?.orbPriceSol?.toFixed(6) || '0'} SOL</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Round */}
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Current Round
                </span>
                <Badge variant="outline" className="font-mono">{status?.round?.id || 'N/A'}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Prize Pool (Motherlode)</span>
                <Badge variant="outline" className="bg-primary/20 text-primary border-primary/50 font-bold">
                  {status?.round?.motherlode?.toFixed(2) || '0'} ORB
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Your Staked ORB</span>
                <div className="font-semibold">{status?.staking?.stakedOrb?.toFixed(2) || '0'} ORB</div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm text-muted-foreground">Total Value</span>
                <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/50">
                  {((status?.balances?.sol || 0) + (status?.balances?.automationSol || 0) + ((status?.balances?.orb || 0) * (status?.prices?.orbPriceSol || 0))).toFixed(4)} SOL
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Claimable Rewards - Compact Tabs */}
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Coins className="h-4 w-4" />
                Claimable Rewards
              </span>
              <Badge variant="outline" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">
                Ready to Claim
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="mining" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="mining">
                  Mining Rewards
                </TabsTrigger>
                <TabsTrigger value="staking">
                  Staking Rewards
                </TabsTrigger>
              </TabsList>
              <TabsContent value="mining" className="mt-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">SOL from Mining</span>
                  <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/50">
                    {status?.claimable?.sol?.toFixed(4) || '0'} SOL
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">ORB from Mining</span>
                  <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/50">
                    {status?.claimable?.orb?.toFixed(2) || '0'} ORB
                  </Badge>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Total Value</span>
                    <span className="font-bold text-green-500">
                      ≈ {((status?.claimable?.sol || 0) + ((status?.claimable?.orb || 0) * (status?.prices?.orbPriceSol || 0))).toFixed(4)} SOL
                    </span>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="staking" className="mt-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Claimable ORB</span>
                  <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/50">
                    {(status?.staking?.accruedRewardsOrb || 0).toFixed(9)} ORB
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Your Staked ORB</span>
                  <span className="text-sm font-semibold">{(status?.staking?.stakedOrb || 0).toFixed(2)} ORB</span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Total Value</span>
                    <span className="font-bold text-green-500">
                      ≈ {((status?.staking?.accruedRewardsOrb || 0) * (status?.prices?.orbPriceSol || 0)).toFixed(4)} SOL
                    </span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
