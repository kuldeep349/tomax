// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract WrappedTOMAX is ERC20, Ownable {
    uint256 public constant INITIAL_CIRCULATING_SUPPLY = 7_000_000 ether;
    uint256 public constant MAX_SUPPLY = 25_000_000 ether;

    uint256 public lockedSupply = 18_000_000 ether;
    uint256 public lastReleaseTimestamp;
    uint256 public currentYear;
    address public timelock;

    mapping(address => bool) public approvedRelease;
    uint256 public approvalCount;
    address[] public multisigApprovers;
    IERC20 public tomaxToken;

    uint256 public constant INITIAL_RELEASE_PERCENTAGE = 5;
    uint256 public constant REDUCED_RELEASE_PERCENTAGE = 4;
    uint256 public constant FINAL_RELEASE_PERCENTAGE = 3;

    event Wrap(address indexed user, uint256 amount);
    event Unwrap(address indexed user, uint256 amount);
    event TokensReleased(uint256 year, uint256 amount, uint256 remainingLockedSupply);
    event FundsWithdrawn(address indexed owner, uint256 amount);

    constructor(
        address _timelock,
        address[] memory _approvers,
        IERC20 _tomaxToken
    ) ERC20("Wrapped TOMAX", "wTOMAX") Ownable() {
        require(_timelock != address(0), "Timelock address required");
        require(_approvers.length >= 3, "Minimum 3 multisig approvers required");
        require(_hasNoDuplicateApprovers(_approvers), "Duplicate approvers not allowed");

        timelock = _timelock;
        multisigApprovers = _approvers;
        tomaxToken = _tomaxToken;

        _mint(msg.sender, INITIAL_CIRCULATING_SUPPLY);
        lastReleaseTimestamp = block.timestamp;
    }

    function _hasNoDuplicateApprovers(address[] memory _approvers) private pure returns (bool) {
        for (uint256 i = 0; i < _approvers.length; i++) {
            for (uint256 j = i + 1; j < _approvers.length; j++) {
                if (_approvers[i] == _approvers[j]) {
                    return false;
                }
            }
        }
        return true;
    }

    function releaseLockedTokens() external onlyOwner {
        require(currentYear < 10, "Release schedule completed");
        require(block.timestamp >= lastReleaseTimestamp + 365 days, "Release only allowed once a year");

        uint256 releasePercentage = getReleasePercentage();
        uint256 releaseAmount = (lockedSupply * releasePercentage) / 100;

        require(releaseAmount > 0, "No tokens available for release");
        require(lockedSupply >= releaseAmount, "Insufficient locked supply");

        lockedSupply -= releaseAmount;
        _mint(msg.sender, releaseAmount);

        lastReleaseTimestamp = block.timestamp;
        currentYear++;

        emit TokensReleased(currentYear, releaseAmount, lockedSupply);
    }

    function getReleasePercentage() public view returns (uint256) {
        if (currentYear < 5) {
            return INITIAL_RELEASE_PERCENTAGE;
        } else if (currentYear < 7) {
            return REDUCED_RELEASE_PERCENTAGE;
        } else {
            return FINAL_RELEASE_PERCENTAGE;
        }
    }

    function wrap(uint256 tomaxAmount) external {
        require(tomaxAmount > 0, "Must send a positive amount");
        require(tomaxToken.balanceOf(msg.sender) >= tomaxAmount, "Insufficient TOMAX balance");
        require(totalSupply() + tomaxAmount <= MAX_SUPPLY, "Exceeds MAX_SUPPLY");

        tomaxToken.transferFrom(msg.sender, address(this), tomaxAmount);
        _mint(msg.sender, tomaxAmount);

        emit Wrap(msg.sender, tomaxAmount);
    }

    function unwrap(uint256 tokenAmount) external {
        require(tokenAmount > 0, "Must send a positive token amount");
        require(balanceOf(msg.sender) >= tokenAmount, "Insufficient wTOMAX balance");
        require(tomaxToken.balanceOf(address(this)) >= tokenAmount, "Insufficient TOMAX balance in contract");

        _burn(msg.sender, tokenAmount);
        tomaxToken.transfer(msg.sender, tokenAmount);

        emit Unwrap(msg.sender, tokenAmount);
    }

    function approveRelease() external {
        require(isMultisigApprover(msg.sender), "Not an approver");
        require(!approvedRelease[msg.sender], "Already approved");

        approvedRelease[msg.sender] = true;
        approvalCount++;

        uint256 requiredApprovals = (multisigApprovers.length + 1) / 2;
        require(approvalCount >= requiredApprovals, "Insufficient approvals");
    }

    function isMultisigApprover(address approver) public view returns (bool) {
        for (uint256 i = 0; i < multisigApprovers.length; i++) {
            if (multisigApprovers[i] == approver) {
                return true;
            }
        }
        return false;
    }

    function withdrawNativeFunds() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");

        (bool success, ) = msg.sender.call{value: balance}("");
        require(success, "Withdraw failed");

        emit FundsWithdrawn(msg.sender, balance);
    }
}