'use client';

import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Wallet,
  Coins,
  Zap,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts';
import { format } from 'date-fns';
import { MiningAnimation } from '@/components/mining-animation';

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

async function fetchAnalytics() {
  const res = await fetch('/api/analytics');
  if (!res.ok) throw new Error('Failed to fetch analytics');
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

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: fetchAnalytics,
    refetchInterval: 60000,
  });

  if (statusLoading || pnlLoading || analyticsLoading) {
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

  // Prepare chart data - only show data from baseline onwards
  const baseline = pnl?.truePnL?.startingBalance || 0;
  const allChartData = (analytics?.balanceHistory || []).map((item: any) => ({
    time: format(new Date(item.timestamp), 'MMM dd HH:mm'),
    sol: item.totalSol || 0,
    isProfit: (item.totalSol || 0) >= baseline,
    timestamp: item.timestamp,
  }));

  // Filter to only show data points at or above baseline (tracking started)
  const chartData = allChartData.filter((item: any) => {
    // Only show points where balance is within reasonable range of baseline
    return item.sol >= baseline * 0.95; // Show points at or near baseline onwards
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Profit & Loss Hero */}
        <Card className="border-primary/50 neon-border overflow-hidden">
          <CardContent className="p-0">
            {/* Chart Header - Full Width */}
            {chartData.length > 0 && (
              <div className="relative bg-gradient-to-b from-black/40 to-transparent">
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={chartData}>
                    <defs>
                      <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity={0.4}/>
                        <stop offset="95%" stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" hide />
                    <YAxis
                      domain={[
                        baseline > 0 ? Math.floor(baseline * 0.98) : 'auto',
                        'auto'
                      ]}
                      hide
                    />
                    {baseline > 0 && (
                      <ReferenceLine
                        y={baseline}
                        stroke="#555"
                        strokeDasharray="3 3"
                        strokeWidth={1}
                        strokeOpacity={0.6}
                      />
                    )}
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0a0a0a',
                        border: '1px solid #333',
                        borderRadius: '4px',
                        fontSize: 10,
                        padding: '4px 8px'
                      }}
                      labelStyle={{ color: '#888', fontSize: 9 }}
                      formatter={(value: any) => [`${Number(value).toFixed(4)} SOL`, '']}
                    />
                    <Line
                      type="monotone"
                      dataKey="sol"
                      stroke={isProfit ? '#22c55e' : '#ef4444'}
                      strokeWidth={2.5}
                      dot={false}
                      fill="url(#colorGradient)"
                      animationDuration={500}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Main Content */}
            <div className="px-6 pt-4 pb-6">
              <div className="flex items-center justify-between mb-6">
                {/* Profit Display */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Net Profit</h3>
                    <Badge variant="outline" className={cn(
                      "text-xs font-bold",
                      isProfit ? "bg-green-500/20 text-green-500 border-green-500/50" : "bg-red-500/20 text-red-500 border-red-500/50"
                    )}>
                      {isProfit ? '+' : ''}{roi.toFixed(2)}%
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className={cn(
                      "text-6xl font-black tracking-tight",
                      isProfit ? "text-green-500 neon-text" : "text-red-500"
                    )}>
                      {isProfit ? '+' : ''}{netPnL.toFixed(4)}
                    </span>
                    <span className="text-3xl font-bold text-muted-foreground/60">SOL</span>
                  </div>
                  <p className="text-xs text-muted-foreground/80">
                    {(pnl?.truePnL?.startingBalance || 0).toFixed(4)} SOL → {(pnl?.truePnL?.currentBalance || 0).toFixed(4)} SOL
                  </p>
                </div>

                {/* Mining Animation */}
                <div className="flex-shrink-0">
                  <MiningAnimation
                    isActive={status?.automation?.isActive || false}
                  />
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-lg p-4">
                  <p className="text-[10px] text-emerald-400/80 uppercase tracking-wide mb-1.5 font-semibold">ORB Earned</p>
                  <p className="text-2xl font-black text-emerald-400 mb-0.5">{(pnl?.breakdown?.income?.orbFromMining || 0).toFixed(2)}</p>
                  <p className="text-[9px] text-muted-foreground/60">(before 10% fee)</p>
                </div>

                <div className="bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20 rounded-lg p-4">
                  <p className="text-[10px] text-purple-400/80 uppercase tracking-wide mb-1.5 font-semibold">ORB Claimed</p>
                  <p className="text-2xl font-black text-purple-400 mb-0.5">{(pnl?.breakdown?.income?.orbSwappedCount || 0).toFixed(2)}</p>
                  <p className="text-[9px] text-muted-foreground/60">(after 10% fee)</p>
                </div>

                <div className="bg-gradient-to-br from-red-500/10 to-transparent border border-red-500/20 rounded-lg p-4">
                  <p className="text-[10px] text-red-400/80 uppercase tracking-wide mb-1.5 font-semibold">Total Fees</p>
                  <p className="text-2xl font-black text-red-400 mb-0.5">{(pnl?.summary?.totalExpenses || 0).toFixed(4)}</p>
                  <p className="text-[9px] text-muted-foreground/60">SOL (all costs)</p>
                </div>
              </div>
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
