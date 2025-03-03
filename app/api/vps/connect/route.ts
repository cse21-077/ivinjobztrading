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
    console.log('Received connection request for user:', userId);
    
    // Validate request body
    if (!userId || !accountId || !derivToken || !eaConfig) {
      console.error('Missing required request fields');
      return NextResponse.json(
        { success: false, error: 'Missing required request fields' },
        { status: 400 }
      );
    }

    console.log('EA Configuration:', {
      server: eaConfig.server,
      login: eaConfig.login,
      eaName: eaConfig.eaName,
      pairs: eaConfig.pairs
    });

    // Validate required fields
    if (!eaConfig?.server || !eaConfig?.login || !eaConfig?.password || !eaConfig?.eaName || !eaConfig?.pairs) {
      console.error('Missing required EA configuration fields');
      return NextResponse.json(
        { success: false, error: 'Missing required EA configuration fields' },
        { status: 400 }
      );
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
      console.error('Failed to start VPS:', error);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to start VPS instance',
          details: error.message 
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