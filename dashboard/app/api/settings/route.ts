import { NextResponse } from 'next/server';
import { ensureBotInitialized } from '@/lib/init-bot';
import { allQuery, runQuery, getQuery } from '@bot/utils/database';
import { encrypt, decrypt, isEncrypted } from '@bot/utils/encryption';
import { refreshConfig } from '@bot/utils/config';
import { isMaintenanceMode, MAINTENANCE_RESPONSE } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Define settable configuration fields
export interface SettingDefinition {
  key: string;
  type: 'number' | 'boolean' | 'select' | 'text' | 'password';
  label: string;
  description: string;
  defaultValue: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  category: 'network' | 'mining' | 'automation' | 'swap' | 'stake' | 'fees' | 'safety' | 'maintenance' | 'display';
  sensitive?: boolean; // If true, value will be encrypted in DB
  placeholder?: string;
}

export const SETTINGS_DEFINITIONS: SettingDefinition[] = [
  // Network Settings
  {
    key: 'RPC_ENDPOINT',
    type: 'text',
    label: 'RPC Endpoint',
    description: 'Solana RPC endpoint URL',
    defaultValue: 'https://api.mainnet-beta.solana.com',
    placeholder: 'https://your-rpc-endpoint.com',
    category: 'network',
  },
  {
    key: 'PRIVATE_KEY',
    type: 'password',
    label: 'Wallet Private Key',
    description: 'Base58 encoded private key (stored encrypted)',
    defaultValue: '',
    placeholder: 'Enter your private key...',
    category: 'network',
    sensitive: true,
  },
  {
    key: 'DASHBOARD_PASSWORD',
    type: 'password',
    label: 'Dashboard Password',
    description: 'Password to access the dashboard remotely (stored encrypted)',
    defaultValue: '',
    placeholder: 'Enter a secure password...',
    category: 'safety',
    sensitive: true,
  },
  {
    key: 'DASHBOARD_PORT',
    type: 'number',
    label: 'Dashboard Port',
    description: 'Port number for the dashboard (requires restart)',
    defaultValue: 3000,
    min: 1024,
    max: 65535,
    step: 1,
    category: 'network',
  },
  {
    key: 'NETWORK',
    type: 'select',
    label: 'Network',
    description: 'Solana network to use',
    defaultValue: 'mainnet-beta',
    options: [
      { value: 'mainnet-beta', label: 'Mainnet Beta' },
      { value: 'devnet', label: 'Devnet' },
      { value: 'testnet', label: 'Testnet' },
    ],
    category: 'network',
  },

  // Mining Settings
  {
    key: 'MINING_ENABLED',
    type: 'boolean',
    label: 'Mining Enabled',
    description: 'Master switch to enable/disable mining (claims and swaps still active when disabled)',
    defaultValue: true,
    category: 'mining',
  },
  {
    key: 'MOTHERLOAD_THRESHOLD',
    type: 'number',
    label: 'Motherload Threshold',
    description: 'Minimum motherload (in ORB) required to start mining',
    defaultValue: 100,
    min: 0,
    max: 1600,
    step: 10,
    category: 'mining',
  },
  {
    key: 'ENABLE_PRODUCTION_COST_CHECK',
    type: 'boolean',
    label: 'Enable Profitability Check',
    description: 'Only deploy when expected value (EV) is positive',
    defaultValue: true,
    category: 'mining',
  },
  {
    key: 'MIN_EXPECTED_VALUE',
    type: 'number',
    label: 'Min Expected Value',
    description: 'Minimum expected profit (in SOL) to deploy',
    defaultValue: 0,
    min: -1,
    max: 1,
    step: 0.01,
    category: 'mining',
  },
  {
    key: 'ESTIMATED_COMPETITION_MULTIPLIER',
    type: 'number',
    label: 'Competition Multiplier',
    description: 'Expected competition level (higher = more conservative)',
    defaultValue: 10,
    min: 1,
    max: 50,
    step: 1,
    category: 'mining',
  },
  {
    key: 'CHECK_ROUND_INTERVAL_MS',
    type: 'number',
    label: 'Check Round Interval (ms)',
    description: 'How often to check for new rounds',
    defaultValue: 10000,
    min: 1000,
    max: 60000,
    step: 1000,
    category: 'mining',
  },

  // Automation Settings
  {
    key: 'BUDGET_TYPE',
    type: 'select',
    label: 'Budget Type',
    description: 'How to determine automation budget',
    defaultValue: 'percentage',
    options: [
      { value: 'percentage', label: 'Percentage of Wallet' },
      { value: 'fixed', label: 'Fixed SOL Amount' },
    ],
    category: 'automation',
  },
  {
    key: 'INITIAL_AUTOMATION_BUDGET_PCT',
    type: 'number',
    label: 'Automation Budget %',
    description: 'Percentage of wallet SOL to allocate to automation (when budget type = percentage)',
    defaultValue: 90,
    min: 1,
    max: 99,
    step: 1,
    category: 'automation',
  },
  {
    key: 'FIXED_BUDGET_AMOUNT',
    type: 'number',
    label: 'Fixed Budget Amount (SOL)',
    description: 'Fixed SOL amount to allocate to automation (when budget type = fixed)',
    defaultValue: 1.0,
    min: 0.1,
    max: 100,
    step: 0.1,
    category: 'automation',
  },
  {
    key: 'DEPLOYMENT_AMOUNT_STRATEGY',
    type: 'select',
    label: 'Deployment Strategy',
    description: 'Strategy for determining SOL amount per round (hover over options for details)',
    defaultValue: 'ultra_conservative',
    options: [
      { value: 'ultra_conservative', label: '🛡️ Ultra Conservative (Recommended)' },
      { value: 'balanced', label: '⚖️ Balanced' },
      { value: 'kelly_optimized', label: '🎯 Kelly Optimized' },
      { value: 'aggressive', label: '⚡ Aggressive' },
      { value: 'manual', label: '✏️ Manual (Fixed Amount)' },
      { value: 'fixed_rounds', label: '🔢 Fixed Rounds' },
      { value: 'percentage', label: '📊 Percentage of Budget' },
    ],
    category: 'automation',
  },
  {
    key: 'MANUAL_AMOUNT_PER_ROUND',
    type: 'number',
    label: 'Manual Amount Per Round',
    description: 'SOL amount per round (when strategy = manual)',
    defaultValue: 0.01,
    min: 0.001,
    max: 10,
    step: 0.001,
    category: 'automation',
  },
  {
    key: 'TARGET_ROUNDS',
    type: 'number',
    label: 'Target Rounds',
    description: 'Target number of rounds (when strategy = fixed_rounds)',
    defaultValue: 100,
    min: 10,
    max: 1000,
    step: 10,
    category: 'automation',
  },
  {
    key: 'BUDGET_PERCENTAGE_PER_ROUND',
    type: 'number',
    label: 'Budget % Per Round',
    description: 'Percentage of budget per round (when strategy = percentage)',
    defaultValue: 1.0,
    min: 0.1,
    max: 10,
    step: 0.1,
    category: 'automation',
  },
  {
    key: 'CLAIM_STRATEGY',
    type: 'select',
    label: 'Claim Strategy',
    description: 'Strategy for claiming rewards',
    defaultValue: 'auto',
    options: [
      { value: 'auto', label: 'Auto (Threshold-Based)' },
      { value: 'manual', label: 'Manual (Dashboard Button)' },
    ],
    category: 'automation',
  },
  {
    key: 'AUTO_CLAIM_SOL_THRESHOLD',
    type: 'number',
    label: 'Auto-Claim SOL Threshold',
    description: 'Auto-claim when claimable SOL exceeds this amount',
    defaultValue: 0.1,
    min: 0,
    max: 10,
    step: 0.1,
    category: 'automation',
  },
  {
    key: 'AUTO_CLAIM_ORB_THRESHOLD',
    type: 'number',
    label: 'Auto-Claim ORB Threshold',
    description: 'Auto-claim when claimable ORB exceeds this amount',
    defaultValue: 1.0,
    min: 0,
    max: 100,
    step: 0.5,
    category: 'automation',
  },
  {
    key: 'AUTO_CLAIM_STAKING_ORB_THRESHOLD',
    type: 'number',
    label: 'Auto-Claim Staking Threshold',
    description: 'Auto-claim staking rewards when ORB exceeds this',
    defaultValue: 0.5,
    min: 0,
    max: 10,
    step: 0.1,
    category: 'automation',
  },
  {
    key: 'CHECK_REWARDS_INTERVAL_MS',
    type: 'number',
    label: 'Check Rewards Interval (ms)',
    description: 'How often to check for claimable rewards',
    defaultValue: 300000,
    min: 60000,
    max: 3600000,
    step: 60000,
    category: 'automation',
  },
  {
    key: 'CHECK_STAKING_REWARDS_INTERVAL_MS',
    type: 'number',
    label: 'Check Staking Rewards Interval (ms)',
    description: 'How often to check for claimable staking rewards (accumulates slower than mining)',
    defaultValue: 600000,
    min: 60000,
    max: 3600000,
    step: 60000,
    category: 'automation',
  },

  // Swap Settings
  {
    key: 'AUTO_SWAP_ENABLED',
    type: 'boolean',
    label: 'Enable Auto-Swap',
    description: 'Automatically swap ORB to SOL when threshold reached',
    defaultValue: true,
    category: 'swap',
  },
  {
    key: 'WALLET_ORB_SWAP_THRESHOLD',
    type: 'number',
    label: 'Swap Threshold (ORB)',
    description: 'Swap when wallet ORB balance exceeds this amount',
    defaultValue: 0.1,
    min: 0,
    max: 100,
    step: 0.1,
    category: 'swap',
  },
  {
    key: 'MIN_ORB_PRICE_USD',
    type: 'number',
    label: 'Min ORB Price (USD)',
    description: 'Minimum ORB price to allow swaps (protects from dumps)',
    defaultValue: 30,
    min: 0,
    max: 200,
    step: 5,
    category: 'swap',
  },
  {
    key: 'MIN_ORB_TO_KEEP',
    type: 'number',
    label: 'Min ORB to Keep',
    description: 'Minimum ORB to keep in wallet (will not swap below this)',
    defaultValue: 0,
    min: 0,
    max: 2000,
    step: 10,
    category: 'swap',
  },
  {
    key: 'MIN_ORB_SWAP_AMOUNT',
    type: 'number',
    label: 'Min ORB Swap Amount',
    description: 'Minimum ORB amount required to execute a swap',
    defaultValue: 0.1,
    min: 0.01,
    max: 10,
    step: 0.1,
    category: 'swap',
  },
  {
    key: 'SLIPPAGE_BPS',
    type: 'number',
    label: 'Slippage (bps)',
    description: 'Maximum slippage for swaps in basis points',
    defaultValue: 50,
    min: 10,
    max: 1000,
    step: 10,
    category: 'swap',
  },
  {
    key: 'JUPITER_API_URL',
    type: 'text',
    label: 'Jupiter API URL',
    description: 'Jupiter aggregator API endpoint',
    defaultValue: 'https://quote-api.jup.ag/v6',
    placeholder: 'https://quote-api.jup.ag/v6',
    category: 'swap',
  },

  // Staking Settings
  {
    key: 'AUTO_STAKE_ENABLED',
    type: 'boolean',
    label: 'Enable Auto-Stake',
    description: 'Automatically stake ORB when threshold reached',
    defaultValue: false,
    category: 'stake',
  },
  {
    key: 'STAKE_ORB_THRESHOLD',
    type: 'number',
    label: 'Stake Threshold (ORB)',
    description: 'Stake when wallet ORB exceeds this amount',
    defaultValue: 50,
    min: 0,
    max: 500,
    step: 10,
    category: 'stake',
  },
  {
    key: 'PRICE_BASED_STAKING_ENABLED',
    type: 'boolean',
    label: 'Enable Price-Based Staking',
    description: 'Three-tier price strategy: stake low, sell rewards mid, take profit high (overrides amount-based staking & MIN_ORB_PRICE_USD)',
    defaultValue: false,
    category: 'stake',
  },
  {
    key: 'PRICE_STAKING_STAKE_BELOW_USD',
    type: 'number',
    label: 'Stake Below Price (USD)',
    description: 'Accumulation mode: Stake all ORB when price is below this threshold',
    defaultValue: 25,
    min: 0,
    max: 200,
    step: 1,
    category: 'stake',
  },
  {
    key: 'PRICE_STAKING_SELL_ABOVE_USD',
    type: 'number',
    label: 'Sell Rewards Above Price (USD)',
    description: 'Sell mining rewards & wallet ORB when price exceeds this (staked ORB stays locked)',
    defaultValue: 40,
    min: 0,
    max: 300,
    step: 1,
    category: 'stake',
  },
  {
    key: 'PRICE_STAKING_TAKE_PROFIT_USD',
    type: 'number',
    label: 'Take Profit Price (USD)',
    description: 'Moon mode: Unstake and sell ALL ORB when price hits this threshold',
    defaultValue: 80,
    min: 0,
    max: 500,
    step: 5,
    category: 'stake',
  },
  {
    key: 'PRICE_STAKING_CHECK_INTERVAL_MS',
    type: 'number',
    label: 'Price Check Interval (ms)',
    description: 'How often to check price for staking/unstaking decisions',
    defaultValue: 120000,
    min: 30000,
    max: 600000,
    step: 30000,
    category: 'stake',
  },

  // Fee Settings
  {
    key: 'PRIORITY_FEE_LEVEL',
    type: 'select',
    label: 'Priority Fee Level',
    description: 'Network priority fee level for transactions',
    defaultValue: 'medium',
    options: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
      { value: 'veryHigh', label: 'Very High' },
    ],
    category: 'fees',
  },
  {
    key: 'MIN_PRIORITY_FEE_MICRO_LAMPORTS',
    type: 'number',
    label: 'Min Priority Fee (μλ)',
    description: 'Minimum priority fee in micro-lamports',
    defaultValue: 100,
    min: 0,
    max: 10000,
    step: 100,
    category: 'fees',
  },
  {
    key: 'MAX_PRIORITY_FEE_MICRO_LAMPORTS',
    type: 'number',
    label: 'Max Priority Fee (μλ)',
    description: 'Maximum priority fee in micro-lamports',
    defaultValue: 50000,
    min: 1000,
    max: 1000000,
    step: 1000,
    category: 'fees',
  },

  // Safety Settings
  {
    key: 'DRY_RUN',
    type: 'boolean',
    label: 'Dry Run Mode',
    description: 'Simulate transactions without sending them (for testing)',
    defaultValue: false,
    category: 'safety',
  },
  {
    key: 'MIN_SOL_BALANCE',
    type: 'number',
    label: 'Min SOL Balance',
    description: 'Minimum SOL to keep in wallet (safety buffer)',
    defaultValue: 0.1,
    min: 0.01,
    max: 10,
    step: 0.05,
    category: 'safety',
  },
  {
    key: 'INCOGNITO_MODE',
    type: 'boolean',
    label: 'Incognito Mode',
    description: 'Hide sensitive information in logs',
    defaultValue: false,
    category: 'safety',
  },

  // Display Settings
  {
    key: 'ENABLE_NEW_ROUND_ANIMATION',
    type: 'boolean',
    label: 'Enable New Round Animation',
    description: 'Show confetti celebration when a new round starts',
    defaultValue: true,
    category: 'display',
  },
  {
    key: 'ENABLE_MOTHERLOAD_ANIMATION',
    type: 'boolean',
    label: 'Enable Motherload Animation',
    description: 'Show confetti celebration when motherload hits threshold',
    defaultValue: true,
    category: 'display',
  },
];

export async function GET() {
  try {
    // Check for maintenance mode - don't access database if in maintenance
    if (isMaintenanceMode()) {
      return NextResponse.json(MAINTENANCE_RESPONSE, { status: 503 });
    }

    await ensureBotInitialized();

    // Fetch all settings from database
    const dbSettings = await allQuery<{ key: string; value: string; type: string }>(
      'SELECT key, value, type FROM settings'
    );

    // Convert to map for easy lookup
    const settingsMap = new Map(dbSettings.map((s) => [s.key, s.value]));

    // Build response with defaults for missing settings
    const settings = SETTINGS_DEFINITIONS.reduce((acc, def) => {
      const dbValue = settingsMap.get(def.key);
      let value: string | number | boolean = dbValue !== undefined ? dbValue : String(def.defaultValue);

      // Decrypt sensitive values
      if (def.sensitive && typeof value === 'string' && value && isEncrypted(value)) {
        try {
          value = decrypt(value);
        } catch (error) {
          console.error(`Failed to decrypt ${def.key}`);
          value = ''; // Return empty if decryption fails
        }
      }

      // Parse value based on type
      if (def.type === 'number' && typeof value === 'string') {
        value = parseFloat(value);
      } else if (def.type === 'boolean' && typeof value === 'string') {
        value = value === 'true' || value === '1';
      }

      // Mask sensitive password fields in response
      if (def.type === 'password' && value) {
        acc[def.key] = {
          ...def,
          value: '********', // Masked for security
          hasValue: Boolean(value), // Indicate if value exists
        };
      } else {
        acc[def.key] = {
          ...def,
          value,
        };
      }

      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Check for maintenance mode - don't access database if in maintenance
    if (isMaintenanceMode()) {
      return NextResponse.json(MAINTENANCE_RESPONSE, { status: 503 });
    }

    await ensureBotInitialized();

    const body = await request.json();

    // Handle batch setting updates (from setup wizard)
    const updates = Object.entries(body);
    const results: any[] = [];

    for (const [key, value] of updates) {
      // Validate that key is in allowed settings
      const settingDef = SETTINGS_DEFINITIONS.find((s) => s.key === key);
      if (!settingDef) {
        continue; // Skip invalid keys
      }

      // Validate and convert value
      let validatedValue: any = value;
      if (settingDef.type === 'number') {
        validatedValue = parseFloat(value as string);
        if (isNaN(validatedValue)) continue;
      } else if (settingDef.type === 'boolean') {
        validatedValue = Boolean(value);
      } else {
        validatedValue = String(value);
      }

      // Encrypt sensitive values
      let storedValue = String(validatedValue);
      if (settingDef.sensitive && validatedValue) {
        storedValue = encrypt(String(validatedValue));
      }

      // Upsert setting
      await runQuery(
        `INSERT INTO settings (key, value, type, description, updated_at)
         VALUES (?, ?, ?, ?, strftime('%s', 'now'))
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = strftime('%s', 'now')`,
        [key, storedValue, settingDef.type, settingDef.description]
      );

      results.push({ key, success: true });
    }

    // Refresh the config cache so changes take effect immediately
    try {
      await refreshConfig();
    } catch (error) {
      console.warn('Failed to refresh config cache:', error);
      // Non-fatal - settings were saved successfully
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Failed to update settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureBotInitialized();

    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: 'Missing key or value' },
        { status: 400 }
      );
    }

    // Validate that key is in allowed settings
    const settingDef = SETTINGS_DEFINITIONS.find((s) => s.key === key);
    if (!settingDef) {
      return NextResponse.json(
        { error: 'Invalid setting key' },
        { status: 400 }
      );
    }

    // Validate value based on type
    let validatedValue: any = value;
    if (settingDef.type === 'number') {
      validatedValue = parseFloat(value);
      if (isNaN(validatedValue)) {
        return NextResponse.json(
          { error: 'Invalid number value' },
          { status: 400 }
        );
      }
      if (settingDef.min !== undefined && validatedValue < settingDef.min) {
        validatedValue = settingDef.min;
      }
      if (settingDef.max !== undefined && validatedValue > settingDef.max) {
        validatedValue = settingDef.max;
      }
    } else if (settingDef.type === 'boolean') {
      validatedValue = Boolean(value);
    } else if (settingDef.type === 'select') {
      if (!settingDef.options?.some((opt) => opt.value === value)) {
        return NextResponse.json(
          { error: 'Invalid select value' },
          { status: 400 }
        );
      }
    } else if (settingDef.type === 'text' || settingDef.type === 'password') {
      validatedValue = String(value);
      // Validate non-empty for required fields
      if (!validatedValue && settingDef.key === 'PRIVATE_KEY') {
        return NextResponse.json(
          { error: 'Private key cannot be empty' },
          { status: 400 }
        );
      }
    }

    // Encrypt sensitive values before storing
    let storedValue = String(validatedValue);
    if (settingDef.sensitive && validatedValue) {
      try {
        storedValue = encrypt(String(validatedValue));
      } catch (error) {
        console.error(`Failed to encrypt ${key}:`, error);
        return NextResponse.json(
          { error: 'Encryption failed' },
          { status: 500 }
        );
      }
    }

    // Check if setting already exists
    const existing = await getQuery<{ id: number }>(
      'SELECT id FROM settings WHERE key = ?',
      [key]
    );

    if (existing) {
      // Update existing setting
      await runQuery(
        'UPDATE settings SET value = ?, updated_at = strftime("%s", "now") WHERE key = ?',
        [storedValue, key]
      );
    } else {
      // Insert new setting
      await runQuery(
        'INSERT INTO settings (key, value, type, description) VALUES (?, ?, ?, ?)',
        [key, storedValue, settingDef.type, settingDef.description]
      );
    }

    // Refresh the config cache so changes take effect immediately
    try {
      await refreshConfig();
    } catch (error) {
      console.warn('Failed to refresh config cache:', error);
      // Non-fatal - settings were saved successfully
    }

    return NextResponse.json({
      success: true,
      key,
      value: settingDef.type === 'password' ? '********' : validatedValue
    });
  } catch (error) {
    console.error('Failed to update setting:', error);
    return NextResponse.json(
      { error: 'Failed to update setting' },
      { status: 500 }
    );
  }
}
