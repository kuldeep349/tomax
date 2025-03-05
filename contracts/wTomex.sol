// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TomaxToken is ERC20, ReentrancyGuard {
    uint256 public constant TOTAL_SUPPLY = 25000000 * 10 ** 18; // 25 million tokens
    uint256 public constant INITIAL_CIRCULATING_SUPPLY = 7000000 * 10 ** 18; // 7 million tokens
    uint256 public lockedSupply = TOTAL_SUPPLY - INITIAL_CIRCULATING_SUPPLY; // 18 million tokens
    uint256 approvalsCount;
    uint256 public currentYear = 1;
    uint256 public releasePercentage = 5; // Starts with 5% for the first 5 years
    bool public paused;
    address[] public owners;
    mapping(address => bool) public isOwner;
    address public superAdmin; // Address of the Super Admin
    mapping(bytes32 => mapping(address => bool)) public approvals; // Mapping for tracking multi-signature approvals

    uint256 public constant REQUIRED_APPROVALS = 3; // Minimum number of approvals out of 5 required for executing certain functions

    event TokensReleased(
        uint256 year,
        uint256 amountReleased,
        uint256 remainingLockedSupply
    );
    event Wrapped(address indexed user, uint256 amount);
    event Unwrapped(address indexed user, uint256 amount);
    event OwnerApproved(address indexed owner, bytes32 requestHash);
    event SuperAdminChanged(
        address indexed oldSuperAdmin,
        address indexed newSuperAdmin
    );

    constructor(
        address[] memory initialOwners,
        address _superAdmin
    ) ERC20("Tomax", "TOMAX") {
        require(initialOwners.length == 5, "There must be exactly 5 owners.");
        for (uint256 i = 0; i < initialOwners.length; i++) {
            require(initialOwners[i] != address(0), "Invalid owner address.");
            require(!isOwner[initialOwners[i]], "Duplicate owner address.");
            owners.push(initialOwners[i]);
            isOwner[initialOwners[i]] = true;
        }

        require(_superAdmin != address(0), "Invalid Super Admin address.");
        superAdmin = _superAdmin;

        _mint(msg.sender, INITIAL_CIRCULATING_SUPPLY); // Mint initial circulating supply
    }

    modifier onlyWhitelisted() {
        require(
            isOwner[msg.sender] || msg.sender == superAdmin,
            "Not an authorized account."
        );
        _;
    }

    modifier multiSigApproval(bytes32 requestHash) {
        for (uint256 i = 0; i < owners.length; i++) {
            if (approvals[requestHash][owners[i]]) {
                approvalsCount++;
                approvals[requestHash][owners[i]] = false;
            }
        }
        require(
            approvalsCount >= REQUIRED_APPROVALS,
            "Not enough approvals from owners."
        );
        approvalsCount = 0;
        _;
    }

    modifier whenNotPausedAndOnlyEOA() {
        require(
            tx.origin == msg.sender,
            "Only the EOA can execute this function"
        );
        require(!paused, "Contract is paused !");
        _;
    }

    // Function to pause the contract (multi-sig required)
    function pause() external onlyWhitelisted {
        bytes32 requestHash = keccak256(abi.encodePacked("pause", currentYear));
        _pause(requestHash);
    }

    // Internal function to handle the pause functionality with multi-sig approval
    function _pause(
        bytes32 requestHash
    ) internal multiSigApproval(requestHash) {
        require(!paused, "Already paused");
        paused = true;
    }

    // Function to unpause the contract (multi-sig required)
    function unpause() external onlyWhitelisted {
        bytes32 requestHash = keccak256(
            abi.encodePacked("unpause", currentYear)
        );
        _unpause(requestHash);
    }

    // Internal function to handle the unpause functionality with multi-sig approval
    function _unpause(
        bytes32 requestHash
    ) internal multiSigApproval(requestHash) {
        require(paused, "Contract is not paused");
        paused = false;
    }

    // Example action to change the Super Admin
    function changeSuperAdmin(
        address newSuperAdmin
    ) external onlyWhitelisted whenNotPausedAndOnlyEOA {
        require(newSuperAdmin != address(0), "Invalid Super Admin address.");
        bytes32 requestHash = keccak256(
            abi.encodePacked("changeSuperAdmin", currentYear)
        );
        _changeSuperAdmin(newSuperAdmin, requestHash);
    }

    // Internal function to change the super admin with multi-sig approval
    function _changeSuperAdmin(
        address newSuperAdmin,
        bytes32 requestHash
    ) internal multiSigApproval(requestHash) {
        address oldSuperAdmin = superAdmin;
        superAdmin = newSuperAdmin;
        emit SuperAdminChanged(oldSuperAdmin, newSuperAdmin);
    }

    // Function to calculate annual release
    function calculateAnnualRelease(
        uint256 _lockedSupply,
        uint256 _releasePercentage
    ) internal pure returns (uint256) {
        return (_lockedSupply * _releasePercentage) / 100;
    }

    // Function to release locked tokens annually with multi-signature approval and superAdmin execution
    function releaseTokens() external onlyWhitelisted whenNotPausedAndOnlyEOA {
        bytes32 requestHash = keccak256(
            abi.encodePacked("releaseTokens", currentYear)
        );
        _releaseTokens(requestHash);
    }

    // Internal function to handle token release logic based on remaining locked supply
    function _releaseTokens(
        bytes32 requestHash
    ) internal multiSigApproval(requestHash) {
        require(lockedSupply > 0, "All tokens have been released");

        uint256 annualRelease;
        // Logic to decide release percentage based on the remaining locked supply
        if (currentYear <= 5) {
            releasePercentage = 5; // Years 1-5: 5% release
        } else if (currentYear <= 7) {
            releasePercentage = 4; // Years 6-7: 4% release
        } else {
            releasePercentage = 3; // Years 8 onwards: 3% release
        }
        // Calculate how many tokens to release based on the current locked supply and the release percentage
        annualRelease = calculateAnnualRelease(lockedSupply, releasePercentage);

        // Ensure we do not release more tokens than what is remaining
        if (annualRelease > lockedSupply) {
            annualRelease = lockedSupply;
        }

        // Update the remaining locked supply
        lockedSupply -= annualRelease;

        // Mint the released tokens to the SuperAdmin
        _mint(superAdmin, annualRelease);

        emit TokensReleased(currentYear, annualRelease, lockedSupply);

        // Move to the next year
        currentYear += 1;
    }

    // Fallback function to accept native TOMAX coins and mint wTOMAX tokens
    receive() external payable {
        wrap();
    }

    // Function to wrap native TOMAX coins into wTOMAX tokens
    function wrap() public payable whenNotPausedAndOnlyEOA {
        require(msg.value > 0, "Amount must be greater than 0");
        uint256 totalSupply = totalSupply();
        require(
            totalSupply + msg.value <= TOTAL_SUPPLY,
            "Cannot mint more than total supply"
        );

        _mint(msg.sender, msg.value);
        emit Wrapped(msg.sender, msg.value);
    }

    // Function to unwrap wTOMAX tokens back into native TOMAX coins
    function unwrap(
        uint256 amount
    ) public nonReentrant whenNotPausedAndOnlyEOA {
        require(balanceOf(msg.sender) >= amount, "Insufficient wTOMAX balance");
        _burn(msg.sender, amount);
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
        emit Unwrapped(msg.sender, amount);
    }

    // Function for owners to approve withdrawal of funds
    function approveWithdraw(
        uint256 amount
    ) external onlyWhitelisted whenNotPausedAndOnlyEOA {
        bytes32 requestHash = keccak256(
            abi.encodePacked("approveWithdraw", amount)
        );
        // Approval process handled by multiSigApproval modifier
        _approveWithdraw(amount, requestHash);
    }

    // Internal function to handle withdrawal with multi-sig approval and superAdmin execution
    function _approveWithdraw(
        uint256 amount,
        bytes32 requestHash
    ) internal multiSigApproval(requestHash) {
        require(
            address(this).balance >= amount,
            "Insufficient contract balance"
        );
        (bool success, ) = payable(superAdmin).call{value: amount}(""); // SuperAdmin executes the withdrawal
        require(success, "Withdrawal failed");
    }

    // Function for owners to approve any request that needs multi-signature approval
    function approveRequest(string memory functionName) public onlyWhitelisted {
        // Convert the function name (string) to bytes32
        bytes32 fhash = keccak256(abi.encodePacked(functionName, currentYear));

        require(
            !approvals[fhash][msg.sender],
            "Owner already approved this request."
        );
        approvals[fhash][msg.sender] = true;

        emit OwnerApproved(msg.sender, fhash);

        // If the required number of approvals (3 out of 5) is reached, execute the request
        // if (approvalsCount >= REQUIRED_APPROVALS) {
        //     executeRequest(requestHash);
        // }
    }

    function approveRequestForWithdrawals(
        string memory functionName,
        uint256 amount
    ) public onlyWhitelisted {
        // Convert the function name (string) to bytes32
        bytes32 fhash = keccak256(abi.encodePacked(functionName, amount));

        require(
            !approvals[fhash][msg.sender],
            "Owner already approved this request."
        );
        approvals[fhash][msg.sender] = true;

        emit OwnerApproved(msg.sender, fhash);
    }

    function approveRequestForOwnerChange(
        string memory functionName,
        address ownerToRemove,
        address newOwner
    ) public onlyWhitelisted {
        // Convert the function name (string) to bytes32
        bytes32 fhash = keccak256(
            abi.encodePacked(functionName, ownerToRemove, newOwner, currentYear)
        );

        require(
            !approvals[fhash][msg.sender],
            "Owner already approved this request."
        );
        approvals[fhash][msg.sender] = true;

        emit OwnerApproved(msg.sender, fhash);
    }

    /**
     * @dev Function to recover tokens accidentally sent to the contract.
     * @param _tokenAddr The token contract address.
     * @param _recoverAddr The address to recover tokens to.
     */

    function foreignTokenRecover(
        address _tokenAddr,
        address _recoverAddr,
        uint256 _amount
    ) external onlyWhitelisted whenNotPausedAndOnlyEOA {
        IERC20(_tokenAddr).transfer(_recoverAddr, _amount);
    }

    // Function to change an owner (multi-sig required)
    function changeOwner(
        address ownerToRemove,
        address newOwner
    ) external onlyWhitelisted whenNotPausedAndOnlyEOA {
        require(newOwner != address(0), "Invalid new owner address.");
        require(isOwner[ownerToRemove], "Owner to remove is not in the list.");

        require(!isOwner[newOwner], "New owner is already in the list.");

        bytes32 requestHash = keccak256(
            abi.encodePacked(
                "changeOwner",
                ownerToRemove,
                newOwner,
                currentYear
            )
        );

        _changeOwner(ownerToRemove, newOwner, requestHash);
    }

    // Internal function to handle owner change with multi-sig approval
    function _changeOwner(
        address ownerToRemove,
        address newOwner,
        bytes32 requestHash
    ) internal multiSigApproval(requestHash) {
        // Remove the old owner from the owners list and mapping
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == ownerToRemove) {
                owners[i] = owners[owners.length - 1]; // Swap the last element with the one to remove
                owners.pop(); // Remove the last element
                break;
            }
        }
        isOwner[ownerToRemove] = false; // Set the removed owner to false in the isOwner mapping

        // Add the new owner
        owners.push(newOwner);
        isOwner[newOwner] = true; // Mark the new address as an owner

        emit OwnerApproved(newOwner, requestHash); // Emit the approval event
    }
}
