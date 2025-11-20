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
import { Settings, TrendingUp, Zap, RefreshCw, DollarSign, Shield, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';

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
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [localValues, setLocalValues] = useState<Record<string, any>>({});

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

  // Initialize local values when data loads
  useEffect(() => {
    if (data?.settings) {
      const values: Record<string, any> = {};
      Object.keys(data.settings).forEach((key) => {
        values[key] = data.settings[key].value;
      });
      setLocalValues(values);
    }
  }, [data]);

  const handleSettingChange = (key: string, value: any) => {
    // Update local state immediately for responsive UI
    setLocalValues((prev) => ({ ...prev, [key]: value }));

    // Debounce API call for number inputs (will be called on blur)
    const setting = data?.settings[key];
    if (setting?.type !== 'number') {
      mutation.mutate({ key, value });
    }
  };

  const handleNumberBlur = (key: string) => {
    const value = localValues[key];
    if (value !== data?.settings[key]?.value) {
      mutation.mutate({ key, value });
    }
  };

  const handleTextBlur = (key: string) => {
    const value = localValues[key];
    // Only update if changed
    if (value !== data?.settings[key]?.value) {
      mutation.mutate({ key, value });
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <Settings className="h-12 w-12 animate-pulse text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const settings = data?.settings || {};
  const categories = Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>;

  return (
    <DashboardLayout>
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

        {/* Settings Tabs */}
        <Tabs defaultValue="network" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
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
            const categorySettings = Object.values(settings).filter(
              (s: any) => s.category === category
            );

            return (
              <TabsContent key={category} value={category} className="space-y-4">
                <Card>
                  <CardContent className="space-y-6 pt-6">
                    {categorySettings.map((setting: any) => (
                      <div key={setting.key} className="space-y-2">
                        <div className="flex items-start justify-between gap-4">
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

                          <div className="ml-4 min-w-[200px]">
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
                              <Input
                                id={setting.key}
                                type="number"
                                value={localValues[setting.key] ?? setting.value}
                                onChange={(e) =>
                                  handleSettingChange(setting.key, parseFloat(e.target.value))
                                }
                                onBlur={() => handleNumberBlur(setting.key)}
                                min={setting.min}
                                max={setting.max}
                                step={setting.step}
                                className="w-full"
                              />
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
    </DashboardLayout>
  );
}
