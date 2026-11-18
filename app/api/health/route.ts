import { NextResponse } from 'next/server';
import { contractAddress, chainId, isConfigured, rpcProvider } from '@/lib/chain';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!isConfigured) return NextResponse.json({ status: 'configuration_required', chainId, deployed: false }, { status: 503 });
  try {
    const provider = rpcProvider();
    const [block, code] = await Promise.all([provider.getBlockNumber(), provider.getCode(contractAddress)]);
    if (code === '0x') return NextResponse.json({ status: 'contract_not_found', chainId, contractAddress }, { status: 503 });
    return NextResponse.json({ status: 'ok', chainId, block, contractAddress, deployed: true });
  } catch {
    return NextResponse.json({ status: 'rpc_unavailable', chainId }, { status: 503 });
  }
}
