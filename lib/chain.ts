import { ethers } from 'ethers';

export const isMainnet = process.env.NEXT_PUBLIC_NETWORK === 'mainnet';
export const chainId = isMainnet ? 4663 : 46630;
export const rpcUrl = isMainnet
  ? process.env.RH_MAINNET_RPC || 'https://rpc.mainnet.chain.robinhood.com'
  : process.env.RH_TESTNET_RPC || 'https://rpc.testnet.chain.robinhood.com';
export const browserRpc = isMainnet
  ? 'https://rpc.mainnet.chain.robinhood.com'
  : 'https://rpc.testnet.chain.robinhood.com';
export const explorerUrl = isMainnet
  ? 'https://robinhoodchain.blockscout.com'
  : 'https://explorer.testnet.chain.robinhood.com';
export const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '';
export const isConfigured = ethers.isAddress(contractAddress) && contractAddress !== ethers.ZeroAddress;

export const bountyAbi = [
  'function bountyCount() view returns (uint256)',
  'function getBounty(uint256) view returns ((address creator,address token,uint256 amount,uint64 deadline,uint64 createdAt,uint32 submissions,uint32 winnerIndex,uint8 status,string title,string details))',
  'function getSubmission(uint256,uint256) view returns ((address developer,uint64 submittedAt,string proofURI))',
  'function hasSubmitted(uint256,address) view returns (bool)',
  'function createBounty(string title,string details,address token,uint256 amount,uint64 deadline) payable returns (uint256)',
  'function submitWork(uint256 bountyId,string proofURI)',
  'function award(uint256 bountyId,uint256 submissionIndex)',
  'function cancel(uint256 bountyId)',
  'function refundExpired(uint256 bountyId)',
  'event BountyCreated(uint256 indexed bountyId,address indexed creator,address indexed token,uint256 amount,uint64 deadline)',
] as const;
export const erc20Abi = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
] as const;

export type Bounty = {
  id: number;
  creator: string;
  token: string;
  amount: string;
  deadline: number;
  createdAt: number;
  submissions: number;
  winnerIndex: number;
  status: number;
  title: string;
  details: string;
};
export type Submission = { developer: string; submittedAt: number; proofURI: string; index: number };

export function formatBounty(id: number, b: any): Bounty {
  return {
    id, creator: String(b.creator), token: String(b.token), amount: String(b.amount),
    deadline: Number(b.deadline), createdAt: Number(b.createdAt),
    submissions: Number(b.submissions), winnerIndex: Number(b.winnerIndex),
    status: Number(b.status), title: String(b.title), details: String(b.details),
  };
}
export function getContract(providerOrSigner: ethers.ContractRunner) {
  if (!isConfigured) throw new Error('Escrow smart contract has not been deployed.');
  return new ethers.Contract(contractAddress, bountyAbi, providerOrSigner);
}
export function rpcProvider() { return new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true }); }
