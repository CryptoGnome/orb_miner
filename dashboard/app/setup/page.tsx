'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle, Loader2, Lock, Server } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const [privateKey, setPrivateKey] = useState('');
  const [rpcEndpoint, setRpcEndpoint] = useState('https://api.mainnet-beta.solana.com');
  const [dashboardPassword, setDashboardPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dashboardPort, setDashboardPort] = useState('3888');
  const [loading, setLoading] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [hasExistingPassword, setHasExistingPassword] = useState(false);

  useEffect(() => {
    // Load existing settings
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        const data = await response.json();

        if (data.settings) {
          // Check if private key is set
          if (data.settings.PRIVATE_KEY?.hasValue) {
            setPrivateKey('********');
            setHasExistingKey(true);
          }

          // Check if password is set
          if (data.settings.DASHBOARD_PASSWORD?.hasValue) {
            setDashboardPassword('********');
            setHasExistingPassword(true);
          }

          // Load RPC endpoint
          if (data.settings.RPC_ENDPOINT?.value) {
            setRpcEndpoint(data.settings.RPC_ENDPOINT.value);
          }

          // Load port
          if (data.settings.DASHBOARD_PORT?.value) {
            setDashboardPort(String(data.settings.DASHBOARD_PORT.value));
          }
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setLoadingSettings(false);
      }
    };

    loadSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate private key format (basic validation)
      // Skip validation if using existing key (shown as stars)
      if (!privateKey.trim() || (privateKey === '********' && !hasExistingKey)) {
        throw new Error('Private key is required');
      }

      if (privateKey !== '********' && privateKey.length < 50) {
        throw new Error('Private key appears to be invalid (too short)');
      }

      // Validate password confirmation if user is setting a new password
      if (dashboardPassword.trim() && dashboardPassword !== '********') {
        if (dashboardPassword !== confirmPassword) {
          throw new Error('Passwords do not match. Please re-enter both passwords.');
        }
      }

      // Save settings
      const settings: Record<string, string | number> = {
        RPC_ENDPOINT: rpcEndpoint.trim() || 'https://api.mainnet-beta.solana.com',
      };

      // Only update private key if it was changed (not showing stars)
      if (privateKey !== '********') {
        settings.PRIVATE_KEY = privateKey.trim();
      }

      // Only update password if it was changed (not showing stars)
      if (dashboardPassword.trim() && dashboardPassword !== '********') {
        settings.DASHBOARD_PASSWORD = dashboardPassword.trim();
      }

      // Add dashboard port
      const port = parseInt(dashboardPort) || 3888;
      if (port >= 1024 && port <= 65535) {
        settings.DASHBOARD_PORT = port;
      }

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccess(true);

      // Redirect to home after 2 seconds
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Setup Complete!</CardTitle>
            <CardDescription>
              Your configuration has been saved successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="space-y-2">
                <p className="font-semibold">Important: Restart Required</p>
                <p>To start mining, you need to restart the bot:</p>
                <ol className="list-decimal ml-6 mt-2 space-y-1">
                  <li>Go to your terminal/command prompt where the bot is running</li>
                  <li>Press <kbd className="px-2 py-1 bg-muted rounded font-mono text-sm">Ctrl+C</kbd> to stop the bot</li>
                  <li>Run <code className="px-2 py-1 bg-muted rounded font-mono text-sm">npm start</code> to restart</li>
                </ol>
                <p className="mt-2 text-sm text-muted-foreground">
                  If using PM2: <code className="px-2 py-1 bg-muted rounded font-mono text-sm">pm2 restart orb-bot</code>
                </p>
              </AlertDescription>
            </Alert>
            <p className="text-center text-muted-foreground">
              Redirecting to dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadingSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/20">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center">🚀 {hasExistingKey ? 'Update' : 'Welcome to'} ORB Mining Bot</CardTitle>
          <CardDescription className="text-center text-base mt-2">
            {hasExistingKey ? 'Update your configuration settings' : "Let's get you set up in just a few steps"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Private Key Input */}
            <div className="space-y-2">
              <Label htmlFor="privateKey" className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4" />
                Wallet Private Key
                {!hasExistingKey && <span className="text-red-500">*</span>}
                {hasExistingKey && <span className="text-green-500 text-sm">(Already set)</span>}
              </Label>
              <Input
                id="privateKey"
                type="password"
                placeholder={hasExistingKey ? "Leave as ******** to keep current key" : "Enter your Base58 private key"}
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                onFocus={(e) => {
                  // Clear stars when user clicks to edit
                  if (e.target.value === '********') {
                    setPrivateKey('');
                  }
                }}
                className="font-mono"
                required={!hasExistingKey}
                disabled={loading}
              />
              <p className="text-sm text-muted-foreground">
                {hasExistingKey
                  ? 'Your private key is already set. Clear the field to enter a new one.'
                  : 'Your private key will be encrypted and stored securely in the database.'}
              </p>
            </div>

            {/* RPC Endpoint Input */}
            <div className="space-y-2">
              <Label htmlFor="rpcEndpoint" className="flex items-center gap-2 text-base">
                <Server className="h-4 w-4" />
                RPC Endpoint
              </Label>
              <Input
                id="rpcEndpoint"
                type="url"
                placeholder="https://api.mainnet-beta.solana.com"
                value={rpcEndpoint}
                onChange={(e) => setRpcEndpoint(e.target.value)}
                disabled={loading}
              />
              <p className="text-sm text-muted-foreground">
                Recommended: Use a premium RPC provider (Helius, Triton, QuickNode) for better performance
              </p>
            </div>

            {/* Dashboard Password Input */}
            <div className="space-y-2">
              <Label htmlFor="dashboardPassword" className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4" />
                Dashboard Password
                {hasExistingPassword && <span className="text-green-500 text-sm">(Already set)</span>}
              </Label>
              <Input
                id="dashboardPassword"
                type="password"
                placeholder={hasExistingPassword ? "Leave as ******** to keep current password" : "Leave empty for no password protection"}
                value={dashboardPassword}
                onChange={(e) => setDashboardPassword(e.target.value)}
                onFocus={(e) => {
                  // Clear stars when user clicks to edit
                  if (e.target.value === '********') {
                    setDashboardPassword('');
                    setConfirmPassword('');
                  }
                }}
                disabled={loading}
              />
              <p className="text-sm text-muted-foreground">
                {hasExistingPassword
                  ? 'Your password is already set. Clear the field to enter a new one.'
                  : 'Recommended for remote access: Set a strong password to protect your dashboard'}
              </p>
            </div>

            {/* Confirm Dashboard Password Input - Only show if user is entering a new password */}
            {dashboardPassword.trim() && dashboardPassword !== '********' && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="flex items-center gap-2 text-base">
                  <Lock className="h-4 w-4" />
                  Confirm Dashboard Password
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter your dashboard password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Please re-enter your password to confirm
                </p>
              </div>
            )}

            {/* Dashboard Port Input */}
            <div className="space-y-2">
              <Label htmlFor="dashboardPort" className="flex items-center gap-2 text-base">
                <Server className="h-4 w-4" />
                Dashboard Port
              </Label>
              <Input
                id="dashboardPort"
                type="number"
                placeholder="3888"
                value={dashboardPort}
                onChange={(e) => setDashboardPort(e.target.value)}
                min="1024"
                max="65535"
                disabled={loading}
              />
              <p className="text-sm text-muted-foreground">
                Port number for accessing the dashboard (default: 3888, requires restart to take effect)
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Security Notice */}
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>
                <strong>Security:</strong> Your private key is encrypted using AES-256 encryption before being stored.
                The bot runs locally on your machine - your keys never leave your computer.
              </AlertDescription>
            </Alert>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || (!privateKey.trim() && !hasExistingKey)}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving Configuration...
                </>
              ) : (
                'Complete Setup'
              )}
            </Button>
          </form>

          {/* Help Text */}
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h3 className="font-semibold mb-2">Need Help?</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Your private key should be in Base58 format (starts with base58 characters)</li>
              <li>• You can export it from Phantom, Solflare, or Solana CLI</li>
              <li>• Free RPC works, but premium RPCs are recommended for best performance</li>
              <li>• All settings can be changed later in the Settings page</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
