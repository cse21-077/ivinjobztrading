import { NextResponse } from 'next/server';
import { VPSService } from '@/lib/vps-service';

export async function POST(request: Request) {
  try {
    // Check required environment variables
    const requiredEnvVars = [
      'VPS_REGION',
      'VPS_ACCESS_KEY_ID',
      'VPS_SECRET_ACCESS_KEY',
      'VPS_INSTANCE_ID',
      'VPS_RDP_HOST',
      'VPS_RDP_USERNAME'
    ];

    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingEnvVars.length > 0) {
      console.error('Missing environment variables:', missingEnvVars);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Server configuration error: Missing environment variables',
          details: `Missing: ${missingEnvVars.join(', ')}`
        },
        { status: 500 }
      );
    }

    console.log('=== Starting VPS Connection Process ===');
    
    // Get request body
    const { userId, accountId, token: derivToken, eaConfig } = await request.json();
    console.log('Received request data:', {
      hasUserId: !!userId,
      hasAccountId: !!accountId,
      hasDerivToken: !!derivToken,
      hasEaConfig: !!eaConfig,
      eaConfigFields: eaConfig ? {
        hasServer: !!eaConfig.server,
        hasLogin: !!eaConfig.login,
        hasPassword: !!eaConfig.password,
        hasEaName: !!eaConfig.eaName,
        hasPairs: !!eaConfig.pairs,
        pairs: eaConfig.pairs
      } : 'No EA config provided'
    });
    
    // Validate request body
    if (!userId || !accountId || !derivToken || !eaConfig) {
      console.error('Missing required request fields:', {
        userId: !userId ? 'missing' : 'present',
        accountId: !accountId ? 'missing' : 'present',
        derivToken: !derivToken ? 'missing' : 'present',
        eaConfig: !eaConfig ? 'missing' : 'present'
      });
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required request fields',
          details: `Missing: ${[
            !userId ? 'userId' : null,
            !accountId ? 'accountId' : null,
            !derivToken ? 'derivToken' : null,
            !eaConfig ? 'eaConfig' : null
          ].filter(Boolean).join(', ')}`
        },
        { status: 400 }
      );
    }

    // Validate token format
    if (!/^[a-zA-Z0-9]{32,128}$/.test(derivToken)) {
      console.error('Invalid Deriv token format');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid token format',
          details: 'The Deriv token provided appears to be in an incorrect format'
        },
        { status: 400 }
      );
    }

    // Validate account ID format (typically CR12345 or similar)
    if (!/^[A-Z]{2,4}[0-9]{5,10}$/.test(accountId)) {
      console.warn('Unusual account ID format:', accountId.substring(0, 2) + '***');
    }

    console.log('EA Configuration:', {
      server: eaConfig.server,
      login: eaConfig.login,
      eaName: eaConfig.eaName,
      pairs: eaConfig.pairs
    });

    // Validate required fields
    if (!eaConfig?.server || !eaConfig?.login || !eaConfig?.password || !eaConfig?.eaName || !eaConfig?.pairs) {
      console.error('Missing required EA configuration fields:', {
        server: !eaConfig.server ? 'missing' : 'present',
        login: !eaConfig.login ? 'missing' : 'present',
        password: !eaConfig.password ? 'missing' : 'present',
        eaName: !eaConfig.eaName ? 'missing' : 'present',
        pairs: !eaConfig.pairs ? 'missing' : 'present'
      });
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required EA configuration fields',
          details: `Missing: ${[
            !eaConfig.server ? 'server' : null,
            !eaConfig.login ? 'login' : null,
            !eaConfig.password ? 'password' : null,
            !eaConfig.eaName ? 'eaName' : null,
            !eaConfig.pairs ? 'pairs' : null
          ].filter(Boolean).join(', ')}`
        },
        { status: 400 }
      );
    }

    // Validate server is an SVG server
    if (!eaConfig.server.toLowerCase().includes('svg')) {
      console.warn('Server may not be an SVG server:', eaConfig.server);
    }

    // Validate pairs are appropriate for the account type
    const accountType = accountId.substring(0, 2).toLowerCase();
    const synthIndicePairs = ['V10', 'V25', 'V50', 'V75', 'V100', 'BOOM', 'CRASH'];
    const forexPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'];
    
    for (const pair of eaConfig.pairs) {
      // Check if synthetic indices account is trying to trade forex pairs
      if (accountType === 'vr' && forexPairs.some(fp => pair.includes(fp))) {
        console.warn('Account type may not support this pair:', { accountType, pair });
      }
      
      // Check if forex account is trying to trade synthetic indices
      if (accountType === 'cr' && synthIndicePairs.some(sp => pair.includes(sp))) {
        console.warn('Account type may not support this pair:', { accountType, pair });
      }
    }

    // Initialize VPS service
    console.log('Initializing VPS service...');
    const vpsService = new VPSService();

    // Start VPS if not running
    console.log('Starting VPS...');
    try {
      await vpsService.startVPS();
      console.log('VPS started successfully');
    } catch (error: any) {
      console.error('Failed to start VPS:', {
        message: error.message,
        code: error.code,
        metadata: error.$metadata,
        stack: error.stack
      });
      
      // Check for specific AWS errors
      if (error.code === 'UnauthorizedOperation') {
        return NextResponse.json(
          {
            success: false,
            error: 'VPS access denied',
            details: 'Please check your VPS credentials and permissions'
          },
          { status: 403 }
        );
      }
      
      if (error.code === 'InvalidInstanceID.NotFound') {
        return NextResponse.json(
          {
            success: false,
            error: 'VPS instance not found',
            details: 'The specified VPS instance ID does not exist'
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to start VPS instance',
          details: error.message,
          code: error.code || 'UNKNOWN_ERROR'
        },
        { status: 500 }
      );
    }

    // Connect to MetaTrader with EA configuration
    console.log('Connecting to MetaTrader...');
    try {
      const mt5Response = await vpsService.connectToMetaTrader({
        server: eaConfig.server,
        login: eaConfig.login,
        password: eaConfig.password,
        eaName: eaConfig.eaName,
        pairs: eaConfig.pairs
      });

      if (!mt5Response) {
        throw new Error('No response from MetaTrader connection');
      }

      console.log('MetaTrader connection successful');

      return NextResponse.json({
        success: true,
        message: 'VPS and MetaTrader connection established',
        vpsId: process.env.VPS_INSTANCE_ID,
        rdpDetails: {
          host: process.env.VPS_RDP_HOST,
          username: process.env.VPS_RDP_USERNAME,
          port: 3389
        },
        mt5Details: {
          server: eaConfig.server,
          login: eaConfig.login,
          eaName: eaConfig.eaName,
          pairs: eaConfig.pairs
        }
      });
    } catch (error: any) {
      console.error('MetaTrader connection error:', error);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to connect to MetaTrader',
          details: error.message 
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('VPS connection error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process request',
        details: error.message 
      },
      { status: 500 }
    );
  }
} 