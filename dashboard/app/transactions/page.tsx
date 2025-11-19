'use client';

import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Receipt } from 'lucide-react';
import { formatDistance } from 'date-fns';

async function fetchTransactions() {
  const res = await fetch('/api/transactions?limit=50');
  if (!res.ok) throw new Error('Failed to fetch transactions');
  return res.json();
}

export default function Transactions() {
  const { data, isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: fetchTransactions,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <Receipt className="mx-auto h-12 w-12 animate-pulse text-primary" />
            <p className="mt-4 text-lg text-muted-foreground">Loading transactions...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const transactions = data?.transactions || [];

  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      deploy: 'bg-blue-500/20 text-blue-500',
      claim_sol: 'bg-green-500/20 text-green-500',
      claim_orb: 'bg-emerald-500/20 text-emerald-500',
      swap: 'bg-purple-500/20 text-purple-500',
      stake: 'bg-yellow-500/20 text-yellow-500',
      automation_setup: 'bg-cyan-500/20 text-cyan-500',
    };
    return colors[type] || 'bg-gray-500/20 text-gray-500';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary neon-text">Transactions</h1>
          <p className="text-muted-foreground">Complete transaction history</p>
        </div>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Recent Transactions ({transactions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>SOL Amount</TableHead>
                  <TableHead>ORB Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx: any) => (
                  <TableRow key={tx.signature || tx.timestamp}>
                    <TableCell>
                      <Badge className={getTypeBadgeColor(tx.type)}>{tx.type.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistance(new Date(tx.timestamp), new Date(), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      {tx.sol_amount ? `${tx.sol_amount.toFixed(4)} SOL` : '-'}
                    </TableCell>
                    <TableCell>
                      {tx.orb_amount ? `${tx.orb_amount.toFixed(2)} ORB` : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={tx.status === 'completed' ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}>
                        {tx.status}
                      </Badge>
                    </TableCell>
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
