'use client';

import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, TrendingUp, Activity, Zap } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
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
          <BarChart3 className="h-12 w-12 animate-pulse text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const balanceHistory = (data?.balanceHistory || []).map((item: any) => ({
    time: format(new Date(item.timestamp), 'MMM dd HH:mm'),
    sol: item.totalSol || 0,
    orb: item.totalOrb || 0,
  }));

  const dailySummaries = (data?.dailySummaries || []).map((item: any) => ({
    date: item.date ? format(new Date(item.date + 'T00:00:00'), 'MMM dd') : '',
    rounds: item.rounds || 0,
    deployed: item.deployed_sol || 0,
  }));

  const priceHistory = (data?.priceHistory || []).map((item: any) => ({
    time: format(new Date(item.timestamp), 'MMM dd HH:mm'),
    price: item.orb_price_usd || 0,
  }));

  const motherloadHistory = (data?.motherloadHistory || []).map((item: any) => ({
    time: format(new Date(item.timestamp), 'MMM dd HH:mm'),
    motherload: item.motherload || 0,
  }));

  const motherloadStats = data?.motherloadStats || {
    min: 0,
    max: 0,
    avg: 0,
    current: 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics & Charts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="balance" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="balance" className="text-xs">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Balance
                </TabsTrigger>
                <TabsTrigger value="activity" className="text-xs">
                  <Activity className="h-3 w-3 mr-1" />
                  Activity
                </TabsTrigger>
                <TabsTrigger value="motherload" className="text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  Motherload
                </TabsTrigger>
                <TabsTrigger value="price" className="text-xs">
                  <BarChart3 className="h-3 w-3 mr-1" />
                  Price
                </TabsTrigger>
              </TabsList>

              {/* Balance History */}
              <TabsContent value="balance" className="mt-4">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">SOL and ORB balance over time</p>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={balanceHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="time" stroke="#888" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#888" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', fontSize: 12 }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Line type="monotone" dataKey="sol" stroke="#00D9FF" strokeWidth={2} name="SOL" dot={false} />
                      <Line type="monotone" dataKey="orb" stroke="#0EA5E9" strokeWidth={2} name="ORB" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              {/* Daily Activity */}
              <TabsContent value="activity" className="mt-4">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Rounds participated and SOL deployed per day</p>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={dailySummaries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#888" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', fontSize: 12 }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Bar dataKey="rounds" fill="#00D9FF" name="Rounds" />
                      <Bar dataKey="deployed" fill="#0EA5E9" name="Deployed (SOL)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              {/* Motherload History */}
              <TabsContent value="motherload" className="mt-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <p>Global motherload over time</p>
                    <div className="flex gap-4">
                      <span>Min: <span className="text-primary">{motherloadStats.min.toFixed(0)} ORB</span></span>
                      <span>Avg: <span className="text-primary">{motherloadStats.avg.toFixed(0)} ORB</span></span>
                      <span>Max: <span className="text-primary">{motherloadStats.max.toFixed(0)} ORB</span></span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={motherloadHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="time" stroke="#888" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#888" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', fontSize: 12 }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <ReferenceLine
                        y={motherloadStats.avg}
                        stroke="#666"
                        strokeDasharray="3 3"
                        label={{ value: 'Avg', position: 'right', fontSize: 10, fill: '#666' }}
                      />
                      <Line type="monotone" dataKey="motherload" stroke="#FFD700" strokeWidth={2} name="Motherload (ORB)" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              {/* Price History */}
              <TabsContent value="price" className="mt-4">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">ORB/USD price over time</p>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={priceHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="time" stroke="#888" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#888" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', fontSize: 12 }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Line type="monotone" dataKey="price" stroke="#00D9FF" strokeWidth={2} name="Price (USD)" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
