'use client';

import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity } from 'lucide-react';
import { formatDistance } from 'date-fns';

async function fetchRounds() {
  const res = await fetch('/api/rounds?limit=20');
  if (!res.ok) throw new Error('Failed to fetch rounds');
  return res.json();
}

export default function Performance() {
  const { data, isLoading } = useQuery({
    queryKey: ['rounds'],
    queryFn: fetchRounds,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <Activity className="mx-auto h-12 w-12 animate-pulse text-primary" />
            <p className="mt-4 text-lg text-muted-foreground">Loading performance data...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const rounds = data?.rounds || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary neon-text">Performance</h1>
          <p className="text-muted-foreground">Mining rounds history and statistics</p>
        </div>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Recent Rounds</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Round ID</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Motherload</TableHead>
                  <TableHead>Deployed</TableHead>
                  <TableHead>Squares</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rounds.map((round: any) => (
                  <TableRow key={round.round_id}>
                    <TableCell className="font-medium">{round.round_id}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistance(new Date(round.timestamp), new Date(), { addSuffix: true })}
                    </TableCell>
                    <TableCell>{round.motherload?.toFixed(2)} ORB</TableCell>
                    <TableCell>{round.deployed_amount?.toFixed(4)} SOL</TableCell>
                    <TableCell>{round.squares_deployed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
