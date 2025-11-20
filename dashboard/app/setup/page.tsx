'use client';

import { useState } from 'react';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate private key format (basic validation)
      if (!privateKey.trim()) {
        throw new Error('Private key is required');
      }

      if (privateKey.length < 50) {
        throw new Error('Private key appears to be invalid (too short)');
      }

      // Save settings
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          PRIVATE_KEY: privateKey.trim(),
          RPC_ENDPOINT: rpcEndpoint.trim() || 'https://api.mainnet-beta.solana.com',
        }),
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
              Your bot is now configured and ready to run. Redirecting...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/20">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center">🚀 Welcome to ORB Mining Bot</CardTitle>
          <CardDescription className="text-center text-base mt-2">
            Let's get you set up in just a few steps
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Private Key Input */}
            <div className="space-y-2">
              <Label htmlFor="privateKey" className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4" />
                Wallet Private Key
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="privateKey"
                type="password"
                placeholder="Enter your Base58 private key"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                className="font-mono"
                required
                disabled={loading}
              />
              <p className="text-sm text-muted-foreground">
                Your private key will be encrypted and stored securely in the database.
                It's never transmitted to any external servers.
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
              disabled={loading || !privateKey.trim()}
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
