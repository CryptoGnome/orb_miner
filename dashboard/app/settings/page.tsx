'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Settings, TrendingUp, Zap, RefreshCw, DollarSign, Shield, Globe, Info, AlertCircle, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useState, useEffect, useRef, useCallback } from 'react';
import { DEPLOYMENT_STRATEGY_DESCRIPTIONS } from '@/lib/strategy-descriptions';

async function fetchSettings() {
  const res = await fetch('/api/settings');
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

async function updateSetting({ key, value }: { key: string; value: any }) {
  const res = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error('Failed to update setting');
  return res.json();
}

const CATEGORY_CONFIG = {
  network: {
    label: 'Network',
    icon: Globe,
    description: 'RPC endpoint and wallet configuration',
  },
  mining: {
    label: 'Mining',
    icon: TrendingUp,
    description: 'Configure mining behavior and profitability checks',
  },
  automation: {
    label: 'Automation',
    icon: Zap,
    description: 'Auto-claim and automation account settings',
  },
  swap: {
    label: 'Swap',
    icon: RefreshCw,
    description: 'Automatic ORB to SOL swap configuration',
  },
  stake: {
    label: 'Staking',
    icon: DollarSign,
    description: 'Automatic ORB staking settings',
  },
  fees: {
    label: 'Fees',
    icon: Settings,
    description: 'Transaction fee preferences',
  },
  safety: {
    label: 'Safety',
    icon: Shield,
    description: 'Safety limits and dry run mode',
  },
  maintenance: {
    label: 'Maintenance',
    icon: Wrench,
    description: 'Database maintenance and reset tools',
  },
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [localValues, setLocalValues] = useState<Record<string, any>>({});
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, any>>({});
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const [showStrategyDialog, setShowStrategyDialog] = useState(false);
  const [pendingStrategyChange, setPendingStrategyChange] = useState<string | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetStep, setResetStep] = useState<'confirm' | 'baseline' | 'resetting' | 'success'>('confirm');
  const [recordAsBaseline, setRecordAsBaseline] = useState(false);
  const [resetResult, setResetResult] = useState<any>(null);
  const [loadingMessage, setLoadingMessage] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const mutation = useMutation({
    mutationFn: updateSetting,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(`Setting updated: ${data.key}`, {
        description: `New value: ${data.value}`,
      });
    },
    onError: (error: any) => {
      toast.error('Failed to update setting', {
        description: error.message,
      });
    },
  });

  // Initialize local values when data loads (but don't overwrite pending updates)
  useEffect(() => {
    if (data?.settings) {
      setLocalValues((prevValues) => {
        const values: Record<string, any> = {};
        Object.keys(data.settings).forEach((key) => {
          // Don't overwrite values that are pending save
          if (pendingUpdates[key] === undefined) {
            values[key] = data.settings[key].value;
          } else {
            values[key] = prevValues[key]; // Keep the pending value
          }
        });
        return values;
      });
    }
  }, [data, pendingUpdates]);

  const debouncedSave = useCallback((key: string, value: any) => {
    // Clear existing timer for this key
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }

    // Mark as pending update
    setPendingUpdates((prev) => ({ ...prev, [key]: value }));

    // Set new timer to save after 800ms of no changes
    debounceTimers.current[key] = setTimeout(() => {
      // Only save if value actually changed
      if (value !== data?.settings[key]?.value) {
        mutation.mutate(
          { key, value },
          {
            onSuccess: () => {
              // Clear pending status on success
              setPendingUpdates((prev) => {
                const newPending = { ...prev };
                delete newPending[key];
                return newPending;
              });
            },
            onError: () => {
              // Clear pending status on error
              setPendingUpdates((prev) => {
                const newPending = { ...prev };
                delete newPending[key];
                return newPending;
              });
            },
          }
        );
      } else {
        // Value unchanged, clear pending
        setPendingUpdates((prev) => {
          const newPending = { ...prev };
          delete newPending[key];
          return newPending;
        });
      }
      delete debounceTimers.current[key];
    }, 800);
  }, [data, mutation]);

  const handleSettingChange = (key: string, value: any) => {
    // Special handling for deployment strategy changes - show dialog
    if (key === 'DEPLOYMENT_AMOUNT_STRATEGY') {
      setPendingStrategyChange(value);
      setShowStrategyDialog(true);
      return; // Don't update immediately
    }

    // Update local state immediately for responsive UI
    setLocalValues((prev) => ({ ...prev, [key]: value }));

    const setting = data?.settings[key];
    if (setting?.type === 'number') {
      // Validate number - don't save NaN
      if (!isNaN(value)) {
        debouncedSave(key, value);
      }
    } else if (setting?.type === 'boolean' || setting?.type === 'select') {
      // Save immediately for toggles and selects (instant feedback)
      mutation.mutate({ key, value });
    }
    // Text and password fields save on blur only (see handleTextBlur)
  };

  const handleTextBlur = (key: string) => {
    const value = localValues[key];
    const currentValue = data?.settings[key]?.value;

    // Only update if changed
    if (value !== currentValue) {
      // Special validation for RPC_ENDPOINT
      if (key === 'RPC_ENDPOINT' && value === 'https://api.mainnet-beta.solana.com') {
        // Warn if switching to public RPC
        const confirmSwitch = window.confirm(
          '⚠️ WARNING: Switching to Public RPC\n\n' +
          'The default public RPC has strict rate limits and will cause 429 errors.\n\n' +
          'Current RPC: ' + currentValue + '\n' +
          'New RPC: ' + value + '\n\n' +
          'Are you sure you want to switch to the public RPC?'
        );

        if (!confirmSwitch) {
          // Revert to current value
          setLocalValues((prev) => ({ ...prev, [key]: currentValue }));
          toast.info('RPC change cancelled', {
            description: 'Keeping your current RPC endpoint'
          });
          return;
        }

        toast.warning('Using public RPC', {
          description: 'Consider using a premium RPC like Helius for better performance'
        });
      }

      mutation.mutate({ key, value });
    }
  };

  const handleConfirmStrategyChange = () => {
    if (pendingStrategyChange) {
      // Update local state
      setLocalValues((prev) => ({ ...prev, DEPLOYMENT_AMOUNT_STRATEGY: pendingStrategyChange }));
      // Save to backend
      mutation.mutate({ key: 'DEPLOYMENT_AMOUNT_STRATEGY', value: pendingStrategyChange });
    }
    setShowStrategyDialog(false);
    setPendingStrategyChange(null);
  };

  const handleCancelStrategyChange = () => {
    // Revert to current value in the UI
    if (data?.settings.DEPLOYMENT_AMOUNT_STRATEGY) {
      setLocalValues((prev) => ({
        ...prev,
        DEPLOYMENT_AMOUNT_STRATEGY: data.settings.DEPLOYMENT_AMOUNT_STRATEGY.value,
      }));
    }
    setShowStrategyDialog(false);
    setPendingStrategyChange(null);
  };

  const loadingMessages = [
    "Politely asking the bot to take a break...",
    "Convincing electrons to rearrange themselves...",
    "Sweeping old data under the digital rug...",
    "Teaching the database some new tricks...",
    "Mining for a fresh start...",
    "Negotiating with stubborn file locks...",
    "Asking Windows nicely to let go...",
    "Performing database yoga (very flexible)...",
    "Turning it off and on again (the pro way)...",
    "Dusting off the cobwebs...",
    "Making backup copies like a responsible adult...",
    "Giving the database a spa day...",
    "Resetting the timeline (no time travel involved)...",
    "Clearing the slate (metaphorically speaking)...",
    "Channeling inner zen while files cooperate...",
  ];

  const handleResetPnL = async () => {
    try {
      setResetStep('resetting');

      // Start cycling through loading messages
      let messageIndex = 0;
      setLoadingMessage(loadingMessages[0]);

      const messageInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        setLoadingMessage(loadingMessages[messageIndex]);
      }, 2000); // Change message every 2 seconds

      const res = await fetch('/api/pnl/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordAsBaseline }),
      });

      clearInterval(messageInterval);

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Failed to reset PnL');
      }

      setResetResult(result);
      setResetStep('success');

      toast.success('PnL Reset Complete', {
        description: 'Database has been reset and backed up successfully',
      });

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['pnl'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (error: any) {
      setResetStep('confirm');
      toast.error('Reset Failed', {
        description: error.message,
      });
    }
  };

  const handleOpenResetDialog = () => {
    setResetStep('confirm');
    setRecordAsBaseline(false);
    setResetResult(null);
    setShowResetDialog(true);
  };

  const handleCloseResetDialog = () => {
    setShowResetDialog(false);
    setResetStep('confirm');
    setRecordAsBaseline(false);
    setResetResult(null);
  };

  if (isLoading || !data) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
              <Settings className="h-8 w-8" />
              Settings
            </h1>
            <p className="text-muted-foreground mt-2">
              Loading configuration...
            </p>
          </div>

          {/* Skeleton Loading State */}
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i}>
                <CardContent className="space-y-4 pt-6">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="flex items-center justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-48 bg-muted/50 animate-pulse rounded" />
                      </div>
                      <div className="h-10 w-48 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const settings = data?.settings || {};
  const categories = Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>;

  return (
    <DashboardLayout>
      <TooltipProvider delayDuration={200}>
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
              <Settings className="h-8 w-8" />
              Settings
            </h1>
            <p className="text-muted-foreground mt-2">
              Configure your mining bot. Changes take effect immediately.
            </p>
          </div>

        {/* Security Notice */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-yellow-500/30 bg-yellow-500/5">
          <Shield className="h-3.5 w-3.5 text-yellow-500/70" />
          <p className="text-xs text-muted-foreground">
            Sensitive data encrypted with AES-256-GCM
          </p>
        </div>

        {/* RPC Warning */}
        {localValues['RPC_ENDPOINT'] === 'https://api.mainnet-beta.solana.com' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-red-500/30 bg-red-500/5">
            <Globe className="h-3.5 w-3.5 text-red-500/70" />
            <p className="text-xs text-muted-foreground">
              ⚠️ Using public RPC - expect rate limiting (429 errors). Get free premium RPC from{' '}
              <a href="https://helius.dev" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                Helius
              </a>
            </p>
          </div>
        )}

        {/* Settings Tabs */}
        <Tabs defaultValue="network" className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-8 gap-2">
            {categories.map((category) => {
              const config = CATEGORY_CONFIG[category];
              const Icon = config.icon;
              return (
                <TabsTrigger key={category} value={category} className="text-xs">
                  <Icon className="h-4 w-4 mr-1" />
                  {config.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {categories.map((category) => {
            // Special handling for maintenance category
            if (category === 'maintenance') {
              return (
                <TabsContent key={category} value={category} className="space-y-4">
                  <Card>
                    <CardContent className="space-y-6 pt-6">
                      <div className="space-y-4">
                        <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                          <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                          <div className="flex-1">
                            <h3 className="font-semibold text-yellow-600 dark:text-yellow-400">
                              Reset PnL Tracking
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              Clear all historical PnL data and start tracking fresh. A backup will be created automatically.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="font-medium">How it works:</h4>

                          <div className="flex items-start gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                            <Info className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <div className="text-sm">
                              <p className="font-semibold text-green-600 dark:text-green-400">Fully Automatic Process</p>
                              <div className="text-muted-foreground mt-1 space-y-1">
                                <p>1. Bot automatically pauses when you click Reset</p>
                                <p>2. Database is backed up and reset</p>
                                <p>3. Bot automatically resumes mining</p>
                                <p className="mt-2">⏱️ Takes about 25-60 seconds (usually ~30s)</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="font-medium">When to use this:</h4>
                          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                            <li>PnL data is corrupted or inaccurate</li>
                            <li>Want to start tracking from scratch</li>
                            <li>Need to set a new baseline after manual deposits</li>
                          </ul>
                        </div>

                        <Button
                          onClick={handleOpenResetDialog}
                          variant="destructive"
                          className="w-full"
                        >
                          <AlertCircle className="h-4 w-4 mr-2" />
                          Reset PnL Data
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            }

            const categorySettings = Object.values(settings).filter(
              (s: any) => s.category === category
            );

            // Helper to check if a setting should be visible based on dependencies
            const isSettingVisible = (setting: any) => {
              // Show INITIAL_AUTOMATION_BUDGET_PCT only when BUDGET_TYPE = 'percentage'
              if (setting.key === 'INITIAL_AUTOMATION_BUDGET_PCT') {
                return localValues['BUDGET_TYPE'] === 'percentage';
              }
              // Show FIXED_BUDGET_AMOUNT only when BUDGET_TYPE = 'fixed'
              if (setting.key === 'FIXED_BUDGET_AMOUNT') {
                return localValues['BUDGET_TYPE'] === 'fixed';
              }
              // Show MANUAL_AMOUNT_PER_ROUND only when DEPLOYMENT_AMOUNT_STRATEGY = 'manual'
              if (setting.key === 'MANUAL_AMOUNT_PER_ROUND') {
                return localValues['DEPLOYMENT_AMOUNT_STRATEGY'] === 'manual';
              }
              // Show TARGET_ROUNDS only when DEPLOYMENT_AMOUNT_STRATEGY = 'fixed_rounds'
              if (setting.key === 'TARGET_ROUNDS') {
                return localValues['DEPLOYMENT_AMOUNT_STRATEGY'] === 'fixed_rounds';
              }
              // Show BUDGET_PERCENTAGE_PER_ROUND only when DEPLOYMENT_AMOUNT_STRATEGY = 'percentage'
              if (setting.key === 'BUDGET_PERCENTAGE_PER_ROUND') {
                return localValues['DEPLOYMENT_AMOUNT_STRATEGY'] === 'percentage';
              }
              // Show claim thresholds only when CLAIM_STRATEGY = 'auto'
              if (
                setting.key === 'AUTO_CLAIM_SOL_THRESHOLD' ||
                setting.key === 'AUTO_CLAIM_ORB_THRESHOLD' ||
                setting.key === 'AUTO_CLAIM_STAKING_ORB_THRESHOLD'
              ) {
                return localValues['CLAIM_STRATEGY'] === 'auto';
              }
              // All other settings are always visible
              return true;
            };

            return (
              <TabsContent key={category} value={category} className="space-y-4">
                <Card>
                  <CardContent className="space-y-6 pt-6">
                    {categorySettings.filter(isSettingVisible).map((setting: any) => (
                      <div key={setting.key} className="space-y-2">
                        <div className="flex flex-col lg:flex-row items-start justify-between gap-3 lg:gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Label htmlFor={setting.key} className="text-base">
                                {setting.label}
                              </Label>
                              {setting.sensitive && (
                                <Badge variant="outline" className="bg-red-500/20 text-red-500 border-red-500/50 text-xs">
                                  Encrypted
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {setting.description}
                            </p>
                          </div>

                          <div className="lg:ml-4 w-full lg:min-w-[200px] lg:w-auto">
                            {setting.type === 'boolean' && (
                              <Switch
                                id={setting.key}
                                checked={localValues[setting.key] ?? setting.value}
                                onCheckedChange={(checked) =>
                                  handleSettingChange(setting.key, checked)
                                }
                              />
                            )}

                            {setting.type === 'number' && (
                              <div className="relative">
                                <Input
                                  id={setting.key}
                                  type="number"
                                  value={localValues[setting.key] ?? setting.value}
                                  onChange={(e) =>
                                    handleSettingChange(setting.key, parseFloat(e.target.value))
                                  }
                                  min={setting.min}
                                  max={setting.max}
                                  step={setting.step}
                                  className="w-full"
                                />
                                {pendingUpdates[setting.key] !== undefined && (
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-yellow-500">
                                    Saving...
                                  </span>
                                )}
                              </div>
                            )}

                            {setting.type === 'text' && (
                              <Input
                                id={setting.key}
                                type="text"
                                value={localValues[setting.key] ?? setting.value}
                                onChange={(e) =>
                                  handleSettingChange(setting.key, e.target.value)
                                }
                                onBlur={() => handleTextBlur(setting.key)}
                                placeholder={setting.placeholder}
                                className="w-full"
                              />
                            )}

                            {setting.type === 'password' && (
                              <div className="space-y-2">
                                <Input
                                  id={setting.key}
                                  type="password"
                                  value={localValues[setting.key] ?? ''}
                                  onChange={(e) =>
                                    handleSettingChange(setting.key, e.target.value)
                                  }
                                  onBlur={() => handleTextBlur(setting.key)}
                                  placeholder={setting.hasValue ? 'Enter new value to update...' : setting.placeholder}
                                  className="w-full"
                                />
                                {setting.hasValue && (
                                  <p className="text-xs text-green-500">Value is set and encrypted</p>
                                )}
                              </div>
                            )}

                            {setting.type === 'select' && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={localValues[setting.key] ?? setting.value}
                                    onValueChange={(value) => handleSettingChange(setting.key, value)}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {setting.options?.map((opt: any) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {setting.key === 'DEPLOYMENT_AMOUNT_STRATEGY' && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className="flex items-center justify-center h-9 w-9 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                                        >
                                          <Info className="h-4 w-4" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="left"
                                        className="max-w-md whitespace-pre-line text-left p-4"
                                      >
                                        {DEPLOYMENT_STRATEGY_DESCRIPTIONS[localValues[setting.key] ?? setting.value] || 'Select a strategy to see details'}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                                {setting.key === 'DEPLOYMENT_AMOUNT_STRATEGY' && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Info className="h-3 w-3" />
                                    Click the info button to see detailed strategy information
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Show current value badge for number/select/text */}
                        {(setting.type === 'number' || setting.type === 'select' || setting.type === 'text') && (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-mono">
                              Current: {localValues[setting.key] ?? setting.value}
                              {setting.type === 'number' && setting.key.includes('THRESHOLD') && ' ORB'}
                              {setting.type === 'number' && setting.key.includes('SOL') && ' SOL'}
                              {setting.type === 'number' && setting.key.includes('USD') && ' USD'}
                              {setting.type === 'number' && setting.key.includes('PCT') && '%'}
                            </Badge>
                            {setting.min !== undefined && setting.max !== undefined && (
                              <span className="text-xs text-muted-foreground">
                                Range: {setting.min} - {setting.max}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
        </div>

        {/* Deployment Strategy Change Dialog */}
        <Dialog open={showStrategyDialog} onOpenChange={setShowStrategyDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                Deployment Strategy Change
              </DialogTitle>
              <DialogDescription className="pt-2 text-base">
                Your deployment strategy change has been saved and will take effect <strong>at the start of the next round</strong>, but only when:
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <span className="text-green-500 font-bold">✓</span>
                  <div>
                    <p className="font-semibold text-green-600 dark:text-green-400">New Automation Created</p>
                    <p className="text-muted-foreground mt-1">When automation budget depletes and the bot creates a new automation account</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <span className="text-green-500 font-bold">✓</span>
                  <div>
                    <p className="font-semibold text-green-600 dark:text-green-400">Motherload Changes Trigger Restart</p>
                    <p className="text-muted-foreground mt-1">
                      When motherload increases by <strong>50%+ AND 100+ ORB</strong> or decreases by <strong>40%+ AND 100+ ORB</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <span className="text-yellow-500 font-bold">!</span>
                  <div>
                    <p className="font-semibold text-yellow-600 dark:text-yellow-400">Existing Automation Unchanged</p>
                    <p className="text-muted-foreground mt-1">
                      If an automation account already exists, it won't change until it's recreated (see conditions above)
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-semibold mb-2">Why does this happen?</p>
                <p className="text-sm text-muted-foreground">
                  The automation account is pre-funded on-chain with a specific deployment amount per round.
                  You cannot change the deployment amount of an existing automation account - it must be closed and recreated.
                </p>
              </div>

              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-semibold mb-2">To force immediate restart:</p>
                <p className="text-sm text-muted-foreground">
                  Run <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">npx ts-node tests/test-close-automation.ts</code> to manually close the automation account.
                  The bot will recreate it with the new strategy on the next round.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleConfirmStrategyChange} className="w-full sm:w-auto">
                Got it!
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PnL Reset Dialog */}
        <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                {resetStep === 'success' ? 'Reset Complete' : 'Reset PnL Tracking'}
              </DialogTitle>
              <DialogDescription className="pt-2">
                {resetStep === 'confirm' && 'This will delete all historical PnL data from the database.'}
                {resetStep === 'baseline' && 'Would you like to record your current automation balance as a baseline?'}
                {resetStep === 'resetting' && 'Resetting PnL data...'}
                {resetStep === 'success' && 'Your PnL data has been reset successfully.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {resetStep === 'confirm' && (
                <>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-red-600 dark:text-red-400">Warning: Destructive Action</p>
                        <p className="text-muted-foreground mt-1">
                          This will permanently delete all transaction history, PnL calculations, and related data.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-blue-600 dark:text-blue-400">Backup Created</p>
                        <p className="text-muted-foreground mt-1">
                          A backup of your database will be saved before deletion.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <h4 className="font-medium text-sm">What happens next:</h4>
                    <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                      <li>Database backup created in data/backups/</li>
                      <li>All PnL data and transactions deleted</li>
                      <li>Fresh database initialized</li>
                      <li>Settings preserved (RPC, private key, etc.)</li>
                    </ol>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-center h-5">
                      <Switch
                        id="baseline"
                        checked={recordAsBaseline}
                        onCheckedChange={setRecordAsBaseline}
                      />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor="baseline" className="font-semibold text-green-600 dark:text-green-400 cursor-pointer">
                        Record current automation as baseline
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        If you have funds in your automation account, record them as starting capital for accurate future PnL tracking.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {resetStep === 'resetting' && (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <RefreshCw className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-sm font-medium">Resetting database...</p>
                  <p className="text-xs text-muted-foreground italic">{loadingMessage}</p>
                </div>
              )}

              {resetStep === 'success' && resetResult && (
                <>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <span className="text-green-500 font-bold text-lg">✓</span>
                      <div className="flex-1">
                        <p className="font-semibold text-green-600 dark:text-green-400">Reset Complete</p>
                        <p className="text-muted-foreground mt-1">
                          Your PnL tracking has been reset and a backup has been created.
                        </p>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4 space-y-2 bg-muted/30">
                      <h4 className="font-medium text-sm">Current State (at reset):</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Automation:</span>
                          <span className="font-mono ml-2">{resetResult.currentState.automationBalance.toFixed(4)} SOL</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Claimable SOL:</span>
                          <span className="font-mono ml-2">{resetResult.currentState.claimableSol.toFixed(4)} SOL</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Claimable ORB:</span>
                          <span className="font-mono ml-2">{resetResult.currentState.claimableOrb.toFixed(4)} ORB</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Wallet ORB:</span>
                          <span className="font-mono ml-2">{resetResult.currentState.walletOrb.toFixed(4)} ORB</span>
                        </div>
                      </div>
                    </div>

                    {resetResult.baselineRecorded && (
                      <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-semibold text-blue-600 dark:text-blue-400">Baseline Recorded</p>
                          <p className="text-muted-foreground mt-1">
                            Starting capital: {resetResult.currentState.automationBalance.toFixed(4)} SOL
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="border-t pt-3">
                      <p className="text-xs text-muted-foreground">
                        Backup saved to: <span className="font-mono">{resetResult.backupPath}</span>
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              {resetStep === 'confirm' && (
                <>
                  <Button onClick={handleCloseResetDialog} variant="outline">
                    Cancel
                  </Button>
                  <Button onClick={handleResetPnL} variant="destructive">
                    Reset PnL Data
                  </Button>
                </>
              )}
              {resetStep === 'success' && (
                <Button onClick={handleCloseResetDialog} className="w-full sm:w-auto">
                  Done
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </DashboardLayout>
  );
}
