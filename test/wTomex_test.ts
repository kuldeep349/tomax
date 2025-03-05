import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { parseEther } from "ethers";

describe("Wrapped token test cases", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployOneYearLockFixture() {
    const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
    const ONE_GWEI = 1_000_000_000;

    // Contracts are deployed using the first signer/account by default
    const [superowner, owner1, owner2, owner3, owner4, owner5, user1, user2] =
      await hre.ethers.getSigners();

    const wTomex = await hre.ethers.getContractFactory("TomaxToken");
    const WTX = await wTomex
      .connect(superowner)
      .deploy([owner1, owner2, owner3, owner4, owner5], superowner);
    const dai = await hre.ethers.getContractFactory("MyToken");
    const MOCKdai = await dai.connect(superowner).deploy();

    await wTomex.attach(WTX.target);
    return {
      WTX,
      wTomex,
      superowner,
      owner1,
      owner2,
      owner3,
      owner4,
      owner5,
      user1,
      user2,
      ONE_YEAR_IN_SECS,
      MOCKdai,
    };
  }

  describe("Deployment", function () {
    it("Should give error in deployment if number of owners are not adequate", async function () {
      const [
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        MOCKdai,
      ] = await hre.ethers.getSigners();

      const wTomex = await hre.ethers.getContractFactory("TomaxToken");
      await expect(
        wTomex
          .connect(superowner)
          .deploy([owner1, owner2, owner3, owner4], superowner)
      ).to.be.revertedWith("There must be exactly 5 owners.");
    });

    it("Should give error in deployment if one of the owner address or super admin address is null", async function () {
      const [superowner, owner1, owner2, owner3, owner4, owner5, user1, user2] =
        await hre.ethers.getSigners();

      const wTomex = await hre.ethers.getContractFactory("TomaxToken");
      await expect(
        wTomex
          .connect(superowner)
          .deploy(
            [
              owner1,
              owner2,
              "0x0000000000000000000000000000000000000000",
              owner4,
              owner5,
            ],
            superowner
          )
      ).to.be.revertedWith("Invalid owner address.");

      await expect(
        wTomex
          .connect(superowner)
          .deploy(
            [owner1, owner2, owner3, owner4, owner5],
            "0x0000000000000000000000000000000000000000"
          )
      ).to.be.revertedWith("Invalid Super Admin address.");
    });

    it("Should give error in deployment if there is duplicacy is owner addresses", async function () {
      const [superowner, owner1, owner2, owner3, owner4, owner5, user1, user2] =
        await hre.ethers.getSigners();

      const wTomex = await hre.ethers.getContractFactory("TomaxToken");
      await expect(
        wTomex
          .connect(superowner)
          .deploy([owner1, owner2, owner3, owner1, owner5], superowner)
      ).to.be.revertedWith("Duplicate owner address.");
    });
    it("Should mint the right amount of wTomex", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
      } = await loadFixture(deployOneYearLockFixture);

      await WTX.connect(user1).wrap({ value: parseEther("10") });

      expect(await WTX.balanceOf(user1)).to.equal("10000000000000000000");
      expect(await ethers.provider.getBalance(WTX)).to.equal(parseEther("10"));
    });
    it("Should burn the right amount of wTomex", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
      } = await loadFixture(deployOneYearLockFixture);

      await WTX.connect(user1).wrap({ value: parseEther("10") });
      await WTX.connect(user1).unwrap(parseEther("10"));
      expect(await WTX.balanceOf(user1)).to.equal(0);
      expect(await ethers.provider.getBalance(WTX)).to.equal(0);
    });

    it("Should mint the initial circulating supply to superowner", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
      } = await loadFixture(deployOneYearLockFixture);
      expect(await WTX.balanceOf(superowner)).to.equal(parseEther("7000000"));
    });
    it("It should withdraw native after approvals from owners", async () => {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
      } = await loadFixture(deployOneYearLockFixture);

      await WTX.connect(user1).wrap({ value: parseEther("10") });
      await WTX.connect(owner1).approveRequestForWithdrawals(
        "approveWithdraw",
        parseEther("10")
      );
      await WTX.connect(owner2).approveRequestForWithdrawals(
        "approveWithdraw",
        parseEther("10")
      );
      await WTX.connect(owner3).approveRequestForWithdrawals(
        "approveWithdraw",
        parseEther("10")
      );

      await WTX.connect(superowner).approveWithdraw(parseEther("10"));

      expect(await ethers.provider.getBalance(WTX)).to.be.eq(0);
    });
    it("Should release correct amount of tokens for the current year", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);
      console.log("before 1st release", await WTX.totalSupply());
      await time.increase(ONE_YEAR_IN_SECS);
      await WTX.connect(owner1).approveRequest("releaseTokens");
      await WTX.connect(owner2).approveRequest("releaseTokens");
      await WTX.connect(owner3).approveRequest("releaseTokens");
      // await WTX.connect(owner4).approveRequest("releaseTokens");
      await WTX.connect(superowner).releaseTokens();
      console.log("after 1st release", await WTX.totalSupply());

      console.log("Remaining locked supply", await WTX.lockedSupply());

      console.log(
        "======================================================================================================================"
      );
      console.log("before 2nd release", await WTX.totalSupply());

      await time.increase(ONE_YEAR_IN_SECS);
      await WTX.connect(owner1).approveRequest("releaseTokens");

      await WTX.connect(owner2).approveRequest("releaseTokens");
      await WTX.connect(owner3).approveRequest("releaseTokens");
      // await WTX.connect(owner4).approveRequest("releaseTokens");
      await WTX.connect(superowner).releaseTokens();
      console.log("after 2nd release", await WTX.totalSupply());
      console.log("Remaining locked supply", await WTX.lockedSupply());

      console.log(
        "======================================================================================================================"
      );

      console.log("before 3rd release", await WTX.totalSupply());

      await time.increase(ONE_YEAR_IN_SECS);
      await WTX.connect(owner1).approveRequest("releaseTokens");

      await WTX.connect(owner2).approveRequest("releaseTokens");
      await WTX.connect(owner3).approveRequest("releaseTokens");
      // await WTX.connect(owner4).approveRequest("releaseTokens");
      await WTX.connect(superowner).releaseTokens();
      console.log("after 3rd release", await WTX.totalSupply());
      console.log("Remaining locked supply", await WTX.lockedSupply());

      console.log(
        "======================================================================================================================"
      );

      console.log("before 4th release", await WTX.totalSupply());

      await time.increase(ONE_YEAR_IN_SECS);
      await WTX.connect(owner1).approveRequest("releaseTokens");

      await WTX.connect(owner2).approveRequest("releaseTokens");
      await WTX.connect(owner3).approveRequest("releaseTokens");
      // await WTX.connect(owner4).approveRequest("releaseTokens");
      await WTX.connect(superowner).releaseTokens();
      console.log("after 4th release", await WTX.totalSupply());
      console.log("Remaining locked supply", await WTX.lockedSupply());

      console.log(
        "======================================================================================================================"
      );

      console.log("before 5th release", await WTX.totalSupply());

      await time.increase(ONE_YEAR_IN_SECS);
      await WTX.connect(owner1).approveRequest("releaseTokens");

      await WTX.connect(owner2).approveRequest("releaseTokens");
      await WTX.connect(owner3).approveRequest("releaseTokens");
      // await WTX.connect(owner4).approveRequest("releaseTokens");
      await WTX.connect(superowner).releaseTokens();
      console.log("after 5th release", await WTX.totalSupply());
      console.log("Remaining locked supply", await WTX.lockedSupply());

      console.log(
        "======================================================================================================================"
      );

      console.log("before 6th release", await WTX.totalSupply());

      await time.increase(ONE_YEAR_IN_SECS);
      await WTX.connect(owner1).approveRequest("releaseTokens");

      await WTX.connect(owner2).approveRequest("releaseTokens");
      await WTX.connect(owner3).approveRequest("releaseTokens");
      // await WTX.connect(owner4).approveRequest("releaseTokens");
      await WTX.connect(superowner).releaseTokens();
      console.log("after 6th release", await WTX.totalSupply());
      console.log("Remaining locked supply", await WTX.lockedSupply());

      console.log(
        "======================================================================================================================"
      );

      console.log("before 7th release", await WTX.totalSupply());

      await time.increase(ONE_YEAR_IN_SECS);
      await WTX.connect(owner1).approveRequest("releaseTokens");

      await WTX.connect(owner2).approveRequest("releaseTokens");
      await WTX.connect(owner3).approveRequest("releaseTokens");
      // await WTX.connect(owner4).approveRequest("releaseTokens");
      await WTX.connect(superowner).releaseTokens();
      console.log("after 7th release", await WTX.totalSupply());
      console.log("Remaining locked supply", await WTX.lockedSupply());

      console.log(
        "======================================================================================================================"
      );

      console.log("before 8th release", await WTX.totalSupply());

      await time.increase(ONE_YEAR_IN_SECS);
      await WTX.connect(owner1).approveRequest("releaseTokens");

      await WTX.connect(owner2).approveRequest("releaseTokens");
      await WTX.connect(owner3).approveRequest("releaseTokens");
      // await WTX.connect(owner4).approveRequest("releaseTokens");
      await WTX.connect(superowner).releaseTokens();
      console.log("after 8th release", await WTX.totalSupply());
      console.log("Remaining locked supply", await WTX.lockedSupply());

      console.log(
        "======================================================================================================================"
      );

      console.log("before 9th release", await WTX.totalSupply());

      await time.increase(ONE_YEAR_IN_SECS);
      await WTX.connect(owner1).approveRequest("releaseTokens");

      await WTX.connect(owner2).approveRequest("releaseTokens");
      await WTX.connect(owner3).approveRequest("releaseTokens");
      // await WTX.connect(owner4).approveRequest("releaseTokens");
      await WTX.connect(superowner).releaseTokens();
      console.log("after 9th release", await WTX.totalSupply());
      console.log("Remaining locked supply", await WTX.lockedSupply());

      console.log(
        "======================================================================================================================"
      );

      console.log("before 10th release", await WTX.totalSupply());

      await time.increase(ONE_YEAR_IN_SECS);
      await WTX.connect(owner1).approveRequest("releaseTokens");

      await WTX.connect(owner2).approveRequest("releaseTokens");
      await WTX.connect(owner3).approveRequest("releaseTokens");
      // await WTX.connect(owner4).approveRequest("releaseTokens");
      await WTX.connect(superowner).releaseTokens();
      console.log("after 10th release", await WTX.totalSupply());
      console.log("Remaining locked supply", await WTX.lockedSupply());

      // expect(await hre.ethers.provider.getBalance(lock.target)).to.equal(
      //   lockedAmount
      // );
    });

    it("Should be able to change the super admin with approvals", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);
      await WTX.connect(owner1).approveRequest("changeSuperAdmin");
      await WTX.connect(owner2).approveRequest("changeSuperAdmin");
      await WTX.connect(owner3).approveRequest("changeSuperAdmin");

      await WTX.connect(owner1).changeSuperAdmin(owner4);

      expect(await WTX.superAdmin()).to.be.eq(owner4);
    });

    it("Should be able to pause the contract after approvals", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);
      await WTX.connect(owner1).approveRequest("pause");
      await WTX.connect(owner2).approveRequest("pause");
      await WTX.connect(owner3).approveRequest("pause");

      await WTX.connect(superowner).pause();

      expect(await WTX.paused()).to.be.eq(true);
    });

    it("Should be able to unpause the contract after approvals", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);
      await WTX.connect(owner1).approveRequest("pause");
      await WTX.connect(owner2).approveRequest("pause");
      await WTX.connect(owner3).approveRequest("pause");
      console.log("pause status", await WTX.paused());
      await WTX.connect(superowner).pause();

      await WTX.connect(owner1).approveRequest("unpause");
      await WTX.connect(owner2).approveRequest("unpause");
      await WTX.connect(owner3).approveRequest("unpause");
      await WTX.connect(superowner).unpause();

      expect(await WTX.paused()).to.be.eq(false);
    });

    it("Should be able to add/remove the owners", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);
      await WTX.connect(owner1).approveRequestForOwnerChange(
        "changeOwner",
        owner4,
        user1
      );
      await WTX.connect(owner2).approveRequestForOwnerChange(
        "changeOwner",
        owner4,
        user1
      );
      await WTX.connect(owner3).approveRequestForOwnerChange(
        "changeOwner",
        owner4,
        user1
      );

      await WTX.connect(superowner).changeOwner(owner4, user1);

      expect(await WTX.isOwner(user1)).to.be.eq(true);
      expect(await WTX.isOwner(owner4)).to.be.eq(false);
    });
    it("Should recover stuck token in the contract", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
        MOCKdai,
      } = await loadFixture(deployOneYearLockFixture);
      await MOCKdai.mint(WTX.target, parseEther("100"));
      await WTX.connect(superowner).foreignTokenRecover(
        MOCKdai,
        user1,
        parseEther("100")
      );
      expect(await MOCKdai.balanceOf(user1)).to.be.eq(parseEther("100"));
    });
  });

  describe("Negative cases", function () {
    it("Should revert with the right error if amount is 0 in wrap function ", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
      } = await loadFixture(deployOneYearLockFixture);

      await expect(
        WTX.connect(user1).wrap({ value: parseEther("0") })
      ).to.be.revertedWith("Amount must be greater than 0");
    });
    it("Should revert with the right error if balance is 0 in unwrap function ", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
      } = await loadFixture(deployOneYearLockFixture);

      await expect(
        WTX.connect(user1).unwrap(parseEther("10"))
      ).to.be.revertedWith("Insufficient wTOMAX balance");
    });

    it("Should revert with the right error if controlled functions are called from another account than whitelisted addresses", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);
      await time.increase(ONE_YEAR_IN_SECS);
      await WTX.connect(owner1).approveRequest("releaseTokens");
      await WTX.connect(owner2).approveRequest("releaseTokens");
      await WTX.connect(owner3).approveRequest("releaseTokens");
      // await WTX.connect(owner4).approveRequest("releaseTokens");
      await expect(WTX.connect(user1).releaseTokens()).to.be.revertedWith(
        "Not an authorized account."
      );
      await expect(
        WTX.connect(user1).changeSuperAdmin(user1)
      ).to.be.revertedWith("Not an authorized account.");
      await expect(
        WTX.connect(user1).approveWithdraw(parseEther("10"))
      ).to.be.revertedWith("Not an authorized account.");

      await expect(WTX.connect(user1).pause()).to.be.revertedWith(
        "Not an authorized account."
      );
      await expect(WTX.connect(user1).unpause()).to.be.revertedWith(
        "Not an authorized account."
      );
    });
    it("Should revert with the right error if contract is paused", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);
      await time.increase(ONE_YEAR_IN_SECS);
      await WTX.connect(owner1).approveRequest("pause");
      await WTX.connect(owner2).approveRequest("pause");
      await WTX.connect(owner3).approveRequest("pause");
      // await WTX.connect(owner4).approveRequest("releaseTokens");
      await WTX.connect(superowner).pause();
      await expect(WTX.connect(superowner).releaseTokens()).to.be.revertedWith(
        "Contract is paused !"
      );
      await expect(
        WTX.connect(superowner).changeSuperAdmin(user1)
      ).to.be.revertedWith("Contract is paused !");
      await expect(
        WTX.connect(superowner).approveWithdraw(parseEther("10"))
      ).to.be.revertedWith("Contract is paused !");
    });

    it("Should fail if the enough number of approvals are not provided", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);
      await time.increase(ONE_YEAR_IN_SECS);
      await WTX.connect(owner1).approveRequest("releaseTokens");
      await WTX.connect(owner2).approveRequest("releaseTokens");
      // await WTX.connect(owner4).approveRequest("releaseTokens");
      await expect(WTX.connect(superowner).releaseTokens()).to.be.revertedWith(
        "Not enough approvals from owners."
      );

      await WTX.connect(owner1).approveRequestForWithdrawals(
        "approveWithdraw",
        parseEther("10")
      );
      await WTX.connect(owner2).approveRequestForWithdrawals(
        "approveWithdraw",
        parseEther("10")
      );
      await expect(
        WTX.connect(superowner).approveWithdraw(parseEther("10"))
      ).to.be.revertedWith("Not enough approvals from owners.");

      await WTX.connect(owner1).approveRequest("changeSuperAdmin");
      await WTX.connect(owner2).approveRequest("changeSuperAdmin");

      await expect(
        WTX.connect(owner1).changeSuperAdmin(owner4)
      ).to.be.revertedWith("Not enough approvals from owners.");
    });

    it("Should fail if the new superadmin address is zero ", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);

      await WTX.connect(owner1).approveRequest("releaseTokens");
      await WTX.connect(owner2).approveRequest("releaseTokens");
      await WTX.connect(owner4).approveRequest("releaseTokens");
      await expect(
        WTX.connect(owner1).changeSuperAdmin(
          "0x0000000000000000000000000000000000000000"
        )
      ).to.be.revertedWith("Invalid Super Admin address.");
    });

    it("Should fail if the withdrawal is made when contract balance is zero", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);

      await WTX.connect(owner1).approveRequestForWithdrawals(
        "approveWithdraw",
        parseEther("10")
      );
      await WTX.connect(owner2).approveRequestForWithdrawals(
        "approveWithdraw",
        parseEther("10")
      );
      await WTX.connect(owner4).approveRequestForWithdrawals(
        "approveWithdraw",
        parseEther("10")
      );
      await expect(
        WTX.connect(owner1).approveWithdraw(parseEther("10"))
      ).to.be.revertedWith("Insufficient contract balance");
    });

    it("Should fail if the same owner tries to give approval twice without execution", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);

      await WTX.connect(owner1).approveRequest("releaseTokens");
      await WTX.connect(owner2).approveRequest("releaseTokens");
      await WTX.connect(owner4).approveRequest("releaseTokens");
      await expect(
        WTX.connect(owner1).approveRequest("releaseTokens")
      ).to.be.revertedWith("Owner already approved this request.");
    });
    it("Should fail if the other than whitelisted addresses tries to give approval", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);

      await expect(
        WTX.connect(user1).approveRequest("releaseTokens")
      ).to.be.revertedWith("Not an authorized account.");

      await expect(
        WTX.connect(user1).approveRequestForWithdrawals(
          "approveWithdraw",
          parseEther("10")
        )
      ).to.be.revertedWith("Not an authorized account.");
    });
    it("Should fail if the same owner tries to give approval for withdrawals twice without execution", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);

      await WTX.connect(owner4).approveRequestForWithdrawals(
        "approveWithdraw",
        parseEther("10")
      );
      await expect(
        WTX.connect(owner4).approveRequestForWithdrawals(
          "approveWithdraw",
          parseEther("10")
        )
      ).to.be.revertedWith("Owner already approved this request.");
    });

    it("Should fail if the same owner tries to give approval for withdrawals twice without execution", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
      } = await loadFixture(deployOneYearLockFixture);

      await WTX.connect(owner1).approveRequestForOwnerChange(
        "changeOwner",
        owner4,
        user1
      );
      await expect(
        WTX.connect(owner1).approveRequestForOwnerChange(
          "changeOwner",
          owner4,
          user1
        )
      ).to.be.revertedWith("Owner already approved this request.");
    });

    it("Foreign recovery token should only be called by whitelisted address and should not run while contract is paused", async function () {
      const {
        WTX,
        wTomex,
        superowner,
        owner1,
        owner2,
        owner3,
        owner4,
        owner5,
        user1,
        user2,
        ONE_YEAR_IN_SECS,
        MOCKdai,
      } = await loadFixture(deployOneYearLockFixture);
      await MOCKdai.mint(WTX.target, parseEther("100"));
      await expect(
        WTX.connect(user1).foreignTokenRecover(
          MOCKdai,
          user1,
          parseEther("100")
        )
      ).to.be.revertedWith("Not an authorized account.");

      await WTX.connect(owner1).approveRequest("pause");
      await WTX.connect(owner2).approveRequest("pause");
      await WTX.connect(owner3).approveRequest("pause");

      await WTX.connect(superowner).pause();

      await expect(
        WTX.connect(superowner).foreignTokenRecover(
          MOCKdai,
          user1,
          parseEther("100")
        )
      ).to.be.revertedWith("Contract is paused !");
    });
  });
});
