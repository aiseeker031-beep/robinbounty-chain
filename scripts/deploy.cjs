const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  if (![46630n, 4663n, 31337n].includes(network.chainId)) throw new Error(`Unexpected chain ${network.chainId}`);
  if (network.chainId === 4663n && process.env.ALLOW_MAINNET_DEPLOY !== "yes") {
    throw new Error("Mainnet deployment requires ALLOW_MAINNET_DEPLOY=yes after independent contract audit and testnet checks.");
  }
  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("No authorized deployment wallet. Set DEPLOYER_PRIVATE_KEY securely in your own environment.");
  const balance = await hre.ethers.provider.getBalance(signer.address);
  if (balance === 0n) throw new Error(`Deployer ${signer.address} has no ETH for gas.`);
  const contract = await hre.ethers.deployContract("RobinBounty");
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = await contract.deploymentTransaction().wait();
  const result = { chainId: Number(network.chainId), contract: address, deployer: signer.address, txHash: receipt.hash, deployedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(__dirname, "..", "deployment.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  console.log(`Set NEXT_PUBLIC_CONTRACT_ADDRESS=${address} in your website environment.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
