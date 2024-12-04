// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TimexToken is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 25_000_000 ether;
    uint256 public constant INITIAL_CIRCULATING_SUPPLY = 7_000_000 ether;
    uint256 public constant LOCKED_SUPPLY = MAX_SUPPLY - INITIAL_CIRCULATING_SUPPLY;
    uint256 public constant INITIAL_RELEASE_PERCENTAGE = 5;
    uint256 public constant REDUCED_RELEASE_PERCENTAGE = 4;
    uint256 public constant FINAL_RELEASE_PERCENTAGE = 3;

    uint256 public lockedSupply = LOCKED_SUPPLY;
    uint256 public lastReleaseTimestamp;
    uint256 public currentYear = 1;

    event TokensReleased(uint256 year, uint256 releasedAmount, uint256 remainingLocked);

    constructor() ERC20("TIMEX", "TOMEX") Ownable(msg.sender){
        _mint(msg.sender, INITIAL_CIRCULATING_SUPPLY);
        lastReleaseTimestamp = block.timestamp;
    }

    function releaseLockedTokens() external onlyOwner {
        require(currentYear <= 10, "Release schedule completed");
        require(block.timestamp >= lastReleaseTimestamp + 365 days, "Release only allowed once a year");

        uint256 releasePercentage = getReleasePercentage();
        uint256 releaseAmount = (lockedSupply * releasePercentage) / 100;

        require(releaseAmount > 0, "No tokens available for release");
        require(lockedSupply >= releaseAmount, "Insufficient locked supply");

        lockedSupply -= releaseAmount;
        _mint(msg.sender, releaseAmount);
        lastReleaseTimestamp = block.timestamp;
        currentYear++;

        emit TokensReleased(currentYear - 1, releaseAmount, lockedSupply);
    }

    function getReleasePercentage() public view returns (uint256) {
        if (currentYear <= 5) {
            return INITIAL_RELEASE_PERCENTAGE;
        } else if (currentYear <= 7) {
            return REDUCED_RELEASE_PERCENTAGE;
        } else {
            return FINAL_RELEASE_PERCENTAGE;
        }
    }

    receive() external payable {}
}