// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./Ownable.sol";

contract WrappedTimexToken is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 25_000_000 ether;
    uint256 public constant INITIAL_CIRCULATING_SUPPLY = 7_000_000 ether;
    uint256 public constant LOCKED_SUPPLY = MAX_SUPPLY - INITIAL_CIRCULATING_SUPPLY;
    uint256 public constant INITIAL_RELEASE_PERCENTAGE = 5;
    uint256 public constant REDUCED_RELEASE_PERCENTAGE = 4;
    uint256 public constant FINAL_RELEASE_PERCENTAGE = 3;

    uint256 public lockedSupply = LOCKED_SUPPLY;
    uint256 public lastReleaseTimestamp;
    uint256 public currentYear = 1;

    address public timelock;
    mapping(address => bool) public approvedRelease;
    address[] public multisigApprovers;
    uint256 public approvalCount;

    event TokensReleased(uint256 indexed year, uint256 indexed amount, uint256 remainingLocked);
    event Wrap(address indexed user, uint256 amount);
    event Unwrap(address indexed user, uint256 amount);
    event FundsWithdrawn(address indexed owner, uint256 amount);

    modifier onlyTimelock() {
        require(msg.sender == timelock, "Timelock only can call this");
        _;
    }

    constructor(address _timelock, address[] memory _approvers) ERC20("Wrapped TIMEX", "wTOMAX") {
        require(_timelock != address(0), "Timelock address required");
        require(_approvers.length >= 3, "Minimum 3 multisig approvers required");

        timelock = _timelock;
        multisigApprovers = _approvers;

        _mint(msg.sender, INITIAL_CIRCULATING_SUPPLY);
        lastReleaseTimestamp = block.timestamp;
    }
    
    function approveRelease() external {
        require(isMultisigApprover(msg.sender), "Not an approver");
        require(!approvedRelease[msg.sender], "Already approved");

        approvedRelease[msg.sender] = true;
        approvalCount++;

        // Calculate majority approval (rounded up)
        uint256 requiredApprovals = (multisigApprovers.length + 1) / 2;
        require(approvalCount >= requiredApprovals, "Insufficient approvals");
    }
    function resetApprovals() internal {
        for (uint256 i = 0; i < multisigApprovers.length; i++) {
            approvedRelease[multisigApprovers[i]] = false;
        }
        approvalCount = 0;
    }

    function releaseLockedTokens() external onlyTimelock {
        require(approvalCount >= multisigApprovers.length / 2 + 1, "Insufficient approvals");
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

        resetApprovals();
        emit TokensReleased(currentYear, releaseAmount, lockedSupply);
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

    function wrap() external payable {
        require(msg.value > 0, "Must send a positive amount");
        require(totalSupply() + msg.value <= MAX_SUPPLY, "Exceeds MAX_SUPPLY");

        _mint(msg.sender, msg.value);
        emit Wrap(msg.sender, msg.value);
    }

    function unwrap(uint256 tokenAmount) external {
        require(tokenAmount > 0, "Must send a positive token amount");
        require(address(this).balance >= tokenAmount, "Insufficient contract balance");

        _burn(msg.sender, tokenAmount);
        (bool success, ) = msg.sender.call{value: tokenAmount}("");
        require(success, "Native coin transfer failed");

        emit Unwrap(msg.sender, tokenAmount);
    }

    function withdrawNativeFunds() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");

        (bool success, ) = msg.sender.call{value: balance}("");
        require(success, "Withdraw failed");

        emit FundsWithdrawn(msg.sender, balance);
    }

    function isMultisigApprover(address approver) public view returns (bool) {
        for (uint256 i = 0; i < multisigApprovers.length; i++) {
            if (multisigApprovers[i] == approver) return true;
        }
        return false;
    }

    receive() external payable {}
}