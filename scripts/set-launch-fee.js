const hre = require("hardhat");

async function main() {
  const launchpadAddress =
    process.env.LAUNCHPAD_ADDRESS || "0x652cA07Ad9e96393dDfe4F4790c5C1d7143683De";
  const newFeeBnb = process.env.NEW_LAUNCH_FEE_BNB || "0.02";

  if (!hre.ethers.isAddress(launchpadAddress)) {
    throw new Error("Invalid LAUNCHPAD_ADDRESS");
  }

  const [owner] = await hre.ethers.getSigners();
  if (!owner) {
    throw new Error("No deployer/owner signer found. Check PRIVATE_KEY in .env");
  }

  const launchpad = await hre.ethers.getContractAt("MemeLaunchpad", launchpadAddress, owner);
  const newFeeWei = hre.ethers.parseEther(newFeeBnb);

  const tx = await launchpad.setLaunchFeeWei(newFeeWei);
  await tx.wait();

  const updatedFeeWei = await launchpad.launchFeeWei();
  console.log("Launch fee updated:");
  console.log(`  Contract: ${launchpadAddress}`);
  console.log(`  Owner: ${owner.address}`);
  console.log(`  New fee (BNB): ${hre.ethers.formatEther(updatedFeeWei)}`);
  console.log(`  Tx: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

