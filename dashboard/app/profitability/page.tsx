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

  const isProfit = (pnl?.netDifference || 0) >= 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary neon-text">Profitability</h1>
          <p className="text-muted-foreground">Detailed profit and loss analysis</p>
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
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className={`text-4xl font-bold ${isProfit ? 'text-green-500 neon-text' : 'text-red-500'}`}>
                {isProfit ? '+' : ''}{(pnl?.netDifference || 0).toFixed(4)} SOL
              </div>
              <div className={`text-lg ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                {isProfit ? '+' : ''}{(pnl?.roi || 0).toFixed(2)}% ROI
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Income Breakdown */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-green-500">Income Breakdown</CardTitle>
            <CardDescription>Total: {(pnl?.incomeBreakdown?.totalIncome || 0).toFixed(4)} SOL</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">SOL Claimed</span>
                <span className="font-semibold">{(pnl?.incomeBreakdown?.solClaimed || 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ORB Swapped</span>
                <span className="font-semibold">{(pnl?.incomeBreakdown?.orbSwapped || 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current ORB Value</span>
                <span className="font-semibold">{(pnl?.incomeBreakdown?.currentOrbValue || 0).toFixed(4)} SOL</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-red-500">Expense Breakdown</CardTitle>
            <CardDescription>Total: {(pnl?.expenseBreakdown?.totalExpenses || 0).toFixed(4)} SOL</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deploy Fees</span>
                <span className="font-semibold">{(pnl?.expenseBreakdown?.deployFees || 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaction Fees</span>
                <span className="font-semibold">{(pnl?.expenseBreakdown?.txFees || 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dev Fees</span>
                <span className="font-semibold">{(pnl?.expenseBreakdown?.devFees || 0).toFixed(4)} SOL</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Balances */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Current Balances</CardTitle>
            <CardDescription>Deployed capital and holdings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Automation Balance</span>
                <span className="font-semibold">{(pnl?.currentBalances?.automation || 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Claimable Rewards</span>
                <span className="font-semibold">{(pnl?.currentBalances?.claimable || 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Current Value</span>
                <span className="font-semibold text-primary">{(pnl?.currentBalances?.total || 0).toFixed(4)} SOL</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
