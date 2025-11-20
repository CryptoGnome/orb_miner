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
          <Receipt className="h-12 w-12 animate-pulse text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const transactions = data?.transactions || [];

  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      deploy: 'bg-blue-500/20 text-blue-500 border-blue-500/50',
      claim_sol: 'bg-green-500/20 text-green-500 border-green-500/50',
      claim_orb: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50',
      swap: 'bg-purple-500/20 text-purple-500 border-purple-500/50',
      stake: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50',
      automation_setup: 'bg-cyan-500/20 text-cyan-500 border-cyan-500/50',
    };
    return colors[type] || 'bg-gray-500/20 text-gray-500 border-gray-500/50';
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Transaction History
              </span>
              <Badge variant="outline">{transactions.length} total</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No transactions found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Time</TableHead>
                    <TableHead className="text-xs text-right">SOL</TableHead>
                    <TableHead className="text-xs text-right">ORB</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        <Badge variant="outline" className={getTypeBadgeColor(tx.type)}>
                          {tx.type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistance(new Date(tx.timestamp), new Date(), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-sm text-right font-mono">
                        {tx.sol_amount ? `${tx.sol_amount.toFixed(4)}` : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-right font-mono">
                        {tx.orb_amount ? `${tx.orb_amount.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={tx.status === 'completed'
                            ? 'bg-green-500/20 text-green-500 border-green-500/50'
                            : 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50'}
                        >
                          {tx.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
