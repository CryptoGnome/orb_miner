'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard,
  DollarSign,
  Activity,
  Receipt,
  BarChart3,
  Settings,
  Zap,
  Pause,
  Play,
  GitBranch,
  Download,
  CheckCircle,
  Github,
} from 'lucide-react';

const navigation = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Profitability', href: '/profitability', icon: DollarSign },
  { name: 'Performance', href: '/performance', icon: Activity },
  { name: 'Transactions', href: '/transactions', icon: Receipt },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

async function fetchStatus() {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json();
}

async function fetchGitStatus() {
  const res = await fetch('/api/git-status');
  if (!res.ok) throw new Error('Failed to fetch git status');
  return res.json();
}

export function Sidebar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  // Only apply active state after hydration to avoid mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: fetchStatus,
    refetchInterval: 10000,
  });

  const { data: gitStatus } = useQuery({
    queryKey: ['git-status'],
    queryFn: fetchGitStatus,
    refetchInterval: 60000, // Check every minute
  });

  const motherload = status?.round?.motherlode || 0;
  const motherloadThreshold = status?.automation?.motherloadThreshold || 150;
  const isAboveThreshold = motherload >= motherloadThreshold;
  const hasAutomation = status?.automation?.isActive || false;

  return (
    <div className="flex h-screen w-64 flex-col border-r border-border bg-card/30 backdrop-blur-sm">
      {/* Logo/Header */}
      <div className="flex h-16 items-center border-b border-border px-6">
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary neon-glow" />
          <span className="text-xl font-bold text-primary neon-text">
            ORB Miner
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = mounted && pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary/20 text-primary neon-border'
                  : 'text-muted-foreground hover:bg-accent hover:text-primary'
              )}
              suppressHydrationWarning
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer - Bot Status */}
      <div className="border-t border-border p-4 space-y-3">
        {/* Bot Status */}
        <div className="rounded-lg bg-accent/50 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Bot Status</p>

          {/* Active/Waiting Status */}
          <div className="flex items-center gap-2">
            {hasAutomation && isAboveThreshold ? (
              <>
                <Play className="h-3 w-3 text-green-500" />
                <span className="text-sm font-semibold text-green-500">Mining</span>
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse ml-auto" />
              </>
            ) : (
              <>
                <Pause className="h-3 w-3 text-yellow-500" />
                <span className="text-sm font-semibold text-yellow-500">Waiting</span>
                <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse ml-auto" />
              </>
            )}
          </div>

          {/* Motherload Status */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Motherload</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  isAboveThreshold
                    ? "bg-green-500/20 text-green-500 border-green-500/50"
                    : "bg-yellow-500/20 text-yellow-500 border-yellow-500/50"
                )}
              >
                {motherload.toFixed(2)} ORB
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Threshold</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-mono",
                  isAboveThreshold
                    ? "bg-blue-500/20 text-blue-400 border-blue-500/50"
                    : "bg-red-500/20 text-red-400 border-red-500/50"
                )}
              >
                {motherloadThreshold} ORB
              </Badge>
            </div>
          </div>
        </div>

        {/* Dashboard Status */}
        <div className="rounded-lg bg-accent/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Dashboard</span>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-xs font-semibold text-green-500">Online</span>
            </div>
          </div>
        </div>

        {/* Git Status */}
        {gitStatus && !gitStatus.error && (
          <div className="rounded-lg bg-accent/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Version</span>
              </div>
              {gitStatus.hasUpdates ? (
                <Badge variant="outline" className="bg-orange-500/20 text-orange-500 border-orange-500/50 text-xs">
                  <Download className="h-3 w-3 mr-1" />
                  {gitStatus.behindBy} update{gitStatus.behindBy > 1 ? 's' : ''}
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/50 text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Up to date
                </Badge>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Branch</span>
                <span className="text-xs font-mono">{gitStatus.currentBranch}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Commit</span>
                <span className="text-xs font-mono">{gitStatus.currentCommitShort}</span>
              </div>
              {gitStatus.lastCommitDate && (
                <div className="pt-1 border-t border-border/50">
                  <p className="text-xs text-muted-foreground truncate" title={gitStatus.lastCommitMessage}>
                    {gitStatus.lastCommitMessage}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">{gitStatus.lastCommitDate}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* GitHub Link */}
        <a
          href="https://github.com/yourusername/orb_miner"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg bg-accent/50 p-3 text-sm text-muted-foreground transition-all hover:bg-accent hover:text-primary"
          suppressHydrationWarning
        >
          <Github className="h-4 w-4" />
          <span className="text-xs font-medium">View on GitHub</span>
        </a>
      </div>
    </div>
  );
}
