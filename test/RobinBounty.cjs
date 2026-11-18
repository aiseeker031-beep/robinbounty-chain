const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RobinBounty", function () {
  let escrow, creator, alice, bob;
  const ONE = ethers.parseEther("1");
  async function timestamp() { return (await ethers.provider.getBlock("latest")).timestamp; }
  async function create() {
    const deadline = (await timestamp()) + 86400;
    await escrow.connect(creator).createBounty("Build a wallet", "Github repository + demo", ethers.ZeroAddress, ONE, deadline, { value: ONE });
    return deadline;
  }
  beforeEach(async () => {
    [creator, alice, bob] = await ethers.getSigners();
    escrow = await ethers.deployContract("RobinBounty");
    await escrow.waitForDeployment();
  });
  it("escrows native ETH and records bounty", async () => {
    await create();
    expect(await ethers.provider.getBalance(escrow.target)).to.equal(ONE);
    expect((await escrow.getBounty(0)).creator).to.equal(creator.address);
  });
  it("rejects invalid funding and durations", async () => {
    const deadline = (await timestamp()) + 86400;
    await expect(escrow.createBounty("A", "B", ethers.ZeroAddress, ONE, deadline, { value: 0 })).to.be.revertedWithCustomError(escrow, "InvalidAmount");
    await expect(escrow.createBounty("A", "B", ethers.ZeroAddress, ONE, 1, { value: ONE })).to.be.revertedWithCustomError(escrow, "InvalidDuration");
  });
  it("prevents duplicate submissions", async () => {
    await create();
    await escrow.connect(alice).submitWork(0, "https://github.com/example/project");
    await expect(escrow.connect(alice).submitWork(0, "second attempt")).to.be.revertedWithCustomError(escrow, "AlreadySubmitted");
    expect((await escrow.getBounty(0)).submissions).to.equal(1);
  });
  it("pays winner and prevents double award", async () => {
    await create();
    await escrow.connect(alice).submitWork(0, "https://github.com/example/project");
    const before = await ethers.provider.getBalance(alice.address);
    await escrow.connect(creator).award(0, 0);
    expect(await ethers.provider.getBalance(alice.address)).to.equal(before + ONE);
    expect((await escrow.getBounty(0)).status).to.equal(1);
    await expect(escrow.connect(creator).award(0, 0)).to.be.revertedWithCustomError(escrow, "InvalidStatus");
  });
  it("cannot cancel if a submission exists", async () => {
    await create();
    await escrow.connect(alice).submitWork(0, "https://example.org/proof");
    await expect(escrow.connect(creator).cancel(0)).to.be.revertedWithCustomError(escrow, "CannotCancel");
  });
  it("can cancel empty bounty and receive escrow back", async () => {
    await create();
    await escrow.connect(creator).cancel(0);
    expect(await ethers.provider.getBalance(escrow.target)).to.equal(0);
    expect((await escrow.getBounty(0)).status).to.equal(2);
  });
  it("returns funds after review window even if submissions exist", async () => {
    const deadline = await create();
    await escrow.connect(alice).submitWork(0, "https://example.org/proof");
    await ethers.provider.send("evm_setNextBlockTimestamp", [deadline + 7 * 86400 + 1]);
    await ethers.provider.send("evm_mine");
    await escrow.connect(bob).refundExpired(0);
    expect((await escrow.getBounty(0)).status).to.equal(3);
    expect(await ethers.provider.getBalance(escrow.target)).to.equal(0);
    await expect(escrow.connect(creator).award(0, 0)).to.be.revertedWithCustomError(escrow, "InvalidStatus");
  });
});
