const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MemeLaunchpad", function () {
  it("deploys token and forwards launch fee", async function () {
    const [owner, creator, feeWallet] = await ethers.getSigners();
    const taxWallet = owner.address;
    const launchFeeWei = ethers.parseEther("0.01");

    const Launchpad = await ethers.getContractFactory("MemeLaunchpad");
    const launchpad = await Launchpad.deploy(feeWallet.address, launchFeeWei, taxWallet);
    await launchpad.waitForDeployment();

    const feeWalletBalanceBefore = await ethers.provider.getBalance(feeWallet.address);

    const tx = await launchpad
      .connect(creator)
      .launchToken("MyMeme", "MEME", 1_000_000, 5, { value: launchFeeWei });
    const receipt = await tx.wait();

    const launchedEvent = receipt.logs
      .map((log) => {
        try {
          return launchpad.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "TokenLaunched");

    expect(launchedEvent).to.not.equal(undefined);
    const tokenAddress = launchedEvent.args.token;
    expect(tokenAddress).to.properAddress;

    const token = await ethers.getContractAt("MemeToken", tokenAddress);
    const creatorBalance = await token.balanceOf(creator.address);
    const expectedSupply = ethers.parseUnits("1000000", 18);
    expect(creatorBalance).to.equal(expectedSupply);
    expect(await token.taxWallet()).to.equal(taxWallet);

    const feeWalletBalanceAfter = await ethers.provider.getBalance(feeWallet.address);
    expect(feeWalletBalanceAfter - feeWalletBalanceBefore).to.equal(launchFeeWei);
  });
});
