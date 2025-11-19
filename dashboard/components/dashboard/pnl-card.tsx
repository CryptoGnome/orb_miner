import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PnLCardProps {
  totalPnL: number;
  roi: number;
  income: number;
  expenses: number;
  className?: string;
}

export function PnLCard({ totalPnL, roi, income, expenses, className }: PnLCardProps) {
  const isProfit = totalPnL >= 0;

  return (
    <Card className={cn('border-primary/50 neon-border', className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Profit & Loss</span>
          {isProfit ? (
            <TrendingUp className="h-5 w-5 text-green-500" />
          ) : (
            <TrendingDown className="h-5 w-5 text-red-500" />
          )}
        </CardTitle>
        <CardDescription>Total profitability overview</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  'text-3xl font-bold',
                  isProfit ? 'text-green-500 neon-text' : 'text-red-500'
                )}
              >
                {isProfit ? '+' : ''}
                {totalPnL.toFixed(4)} SOL
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={cn(
                  'text-sm font-medium',
                  isProfit ? 'text-green-500' : 'text-red-500'
                )}
              >
                {isProfit ? '+' : ''}
                {roi.toFixed(2)}% ROI
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
            <div>
              <p className="text-sm text-muted-foreground">Total Income</p>
              <p className="text-lg font-semibold text-green-500">
                +{income.toFixed(4)} SOL
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Expenses</p>
              <p className="text-lg font-semibold text-red-500">
                -{expenses.toFixed(4)} SOL
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
