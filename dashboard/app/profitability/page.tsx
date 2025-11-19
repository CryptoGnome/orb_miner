'use client';

import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

async function fetchPnL() {
  const res = await fetch('/api/pnl');
  if (!res.ok) throw new Error('Failed to fetch PnL');
  return res.json();
}

export default function Profitability() {
  const { data: pnl, isLoading } = useQuery({
    queryKey: ['pnl'],
    queryFn: fetchPnL,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <DollarSign className="mx-auto h-12 w-12 animate-pulse text-primary" />
            <p className="mt-4 text-lg text-muted-foreground">Loading PnL data...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isProfit = (pnl?.summary?.netProfit || 0) >= 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary neon-text">Profitability</h1>
          <p className="text-muted-foreground">Detailed profit and loss analysis (Unified System)</p>
        </div>

        {/* Net PnL Card */}
        <Card className="border-primary/50 neon-border">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Net Profit & Loss</span>
              {isProfit ? (
                <TrendingUp className="h-6 w-6 text-green-500" />
              ) : (
                <TrendingDown className="h-6 w-6 text-red-500" />
              )}
            </CardTitle>
            <CardDescription>
              Starting: {(pnl?.truePnL?.startingBalance || 0).toFixed(4)} SOL →
              Current: {(pnl?.truePnL?.currentBalance || 0).toFixed(4)} SOL
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className={`text-4xl font-bold ${isProfit ? 'text-green-500 neon-text' : 'text-red-500'}`}>
                {isProfit ? '+' : ''}{(pnl?.summary?.netProfit || 0).toFixed(4)} SOL
              </div>
              <div className={`text-lg ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                {isProfit ? '+' : ''}{(pnl?.summary?.roi || 0).toFixed(2)}% ROI
              </div>
              {!pnl?.truePnL?.hasBaseline && (
                <p className="text-sm text-yellow-500 mt-2">
                  ⚠️ No baseline set - profit calculated from earliest snapshot
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Income Breakdown */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-green-500">Income Breakdown</CardTitle>
            <CardDescription>Total: {(pnl?.breakdown?.income?.totalSolIncome || 0).toFixed(4)} SOL</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">SOL from Mining</span>
                <span className="font-semibold">{(pnl?.breakdown?.income?.solFromMining || 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ORB from Mining</span>
                <span className="font-semibold">{(pnl?.breakdown?.income?.orbFromMining || 0).toFixed(2)} ORB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SOL from Swaps</span>
                <span className="font-semibold">{(pnl?.breakdown?.income?.solFromSwaps || 0).toFixed(4)} SOL</span>
              </div>
              {pnl?.breakdown?.income?.orbSwappedCount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">ORB Sold</span>
                  <span>{(pnl.breakdown.income.orbSwappedCount || 0).toFixed(2)} ORB</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current ORB Value</span>
                <span className="font-semibold">{(pnl?.truePnL?.holdings?.orbValueSol || 0).toFixed(4)} SOL</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-red-500">Expense Breakdown</CardTitle>
            <CardDescription>Total: {(pnl?.breakdown?.expenses?.totalExpenses || 0).toFixed(4)} SOL</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Capital Deployed</span>
                <span className="font-semibold">{(pnl?.breakdown?.expenses?.deployedSol || 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaction Fees</span>
                <span className="font-semibold">{(pnl?.breakdown?.expenses?.transactionFees || 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Protocol Fees (10%)</span>
                <span className="font-semibold">{(pnl?.breakdown?.expenses?.protocolFees || 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dev Fees (0.5%)</span>
                <span className="font-semibold">{(pnl?.breakdown?.expenses?.devFees || 0).toFixed(4)} SOL</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Holdings */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Current Holdings</CardTitle>
            <CardDescription>Your complete portfolio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Wallet SOL</span>
                <span className="font-semibold">{(pnl?.truePnL?.holdings?.walletSol || 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Automation SOL</span>
                <span className="font-semibold">{(pnl?.truePnL?.holdings?.automationSol || 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Claimable SOL</span>
                <span className="font-semibold">{(pnl?.truePnL?.holdings?.claimableSol || 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total ORB</span>
                <span className="font-semibold">{(pnl?.truePnL?.holdings?.totalOrb || 0).toFixed(2)} ORB</span>
              </div>
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-semibold">Total SOL</span>
                  <span className="font-bold text-primary">{(pnl?.truePnL?.holdings?.totalSol || 0).toFixed(4)} SOL</span>
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-muted-foreground font-semibold">Total Value (incl. ORB)</span>
                  <span className="font-bold text-primary">{(pnl?.truePnL?.currentBalance || 0).toFixed(4)} SOL</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activity Stats */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Activity Statistics</CardTitle>
            <CardDescription>Your mining history</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Rounds</p>
                <p className="text-2xl font-bold">{pnl?.breakdown?.stats?.roundsParticipated || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Deployments</p>
                <p className="text-2xl font-bold">{pnl?.breakdown?.stats?.totalDeployments || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Claims</p>
                <p className="text-2xl font-bold">{pnl?.breakdown?.stats?.totalClaims || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Swaps</p>
                <p className="text-2xl font-bold">{pnl?.breakdown?.stats?.totalSwaps || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
