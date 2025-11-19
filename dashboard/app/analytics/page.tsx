'use client';

import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

async function fetchAnalytics() {
  const res = await fetch('/api/analytics');
  if (!res.ok) throw new Error('Failed to fetch analytics');
  return res.json();
}

export default function Analytics() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: fetchAnalytics,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <BarChart3 className="mx-auto h-12 w-12 animate-pulse text-primary" />
            <p className="mt-4 text-lg text-muted-foreground">Loading analytics...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const balanceHistory = (data?.balanceHistory || []).map((item: any) => ({
    time: format(new Date(item.timestamp), 'MMM dd HH:mm'),
    sol: item.wallet_sol + item.automation_sol,
    orb: item.wallet_orb,
  }));

  const dailySummaries = (data?.dailySummaries || []).map((item: any) => ({
    date: format(new Date(item.date), 'MMM dd'),
    rounds: item.total_rounds,
    deployed: item.total_deployed,
  }));

  const priceHistory = (data?.priceHistory || []).map((item: any) => ({
    time: format(new Date(item.timestamp), 'MMM dd HH:mm'),
    price: item.orb_price_usd,
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary neon-text">Analytics</h1>
          <p className="text-muted-foreground">Charts and data visualization</p>
        </div>

        {/* Balance History Chart */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Balance History</CardTitle>
            <CardDescription>SOL and ORB balance over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={balanceHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Line type="monotone" dataKey="sol" stroke="#00D9FF" strokeWidth={2} name="SOL" />
                <Line type="monotone" dataKey="orb" stroke="#0EA5E9" strokeWidth={2} name="ORB" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Daily Summaries Chart */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Daily Activity</CardTitle>
            <CardDescription>Rounds participated and SOL deployed per day</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailySummaries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Bar dataKey="rounds" fill="#00D9FF" name="Rounds" />
                <Bar dataKey="deployed" fill="#0EA5E9" name="Deployed (SOL)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ORB Price History */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>ORB Price History</CardTitle>
            <CardDescription>ORB/USD price over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={priceHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Line type="monotone" dataKey="price" stroke="#00D9FF" strokeWidth={2} name="Price (USD)" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
