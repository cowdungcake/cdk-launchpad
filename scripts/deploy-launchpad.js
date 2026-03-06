const hre = require("hardhat");

async function main() {
  const feeWallet = process.env.FEE_WALLET;
  const taxWallet = process.env.TAX_WALLET || feeWallet;
  const launchFeeBnb = process.env.LAUNCH_FEE_BNB || "0.02";

  if (!feeWallet) {
    throw new Error("Missing FEE_WALLET in .env");
  }
  if (!hre.ethers.isAddress(feeWallet)) {
    throw new Error("FEE_WALLET is not a valid EVM address");
  }
  if (!taxWallet || !hre.ethers.isAddress(taxWallet)) {
    throw new Error("TAX_WALLET is not a valid EVM address");
  }

  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No deployer account configured. Set PRIVATE_KEY in .env to 64 hex chars (with or without 0x)."
    );
  }
  const deployer = signers[0];

  const launchFeeWei = hre.ethers.parseEther(launchFeeBnb);
  const Launchpad = await hre.ethers.getContractFactory("MemeLaunchpad");
  const launchpad = await Launchpad.deploy(feeWallet, launchFeeWei, taxWallet);

  await launchpad.waitForDeployment();
  const launchpadAddress = await launchpad.getAddress();

  console.log("MemeLaunchpad deployed:");
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Address: ${launchpadAddress}`);
  console.log(`  Fee wallet: ${feeWallet}`);
  console.log(`  Fixed tax wallet: ${taxWallet}`);
  console.log(`  Launch fee (BNB): ${launchFeeBnb}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
