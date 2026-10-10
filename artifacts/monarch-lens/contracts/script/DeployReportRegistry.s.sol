// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../src/ReportRegistry.sol";

interface Vm {
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploy the registry to Monad Testnet only.
/// @dev Re-running with the same account uses its next transaction nonce and
///      creates another instance; record the address printed by Forge.
contract DeployReportRegistry {
    uint256 private constant MONAD_TESTNET_CHAIN_ID = 10143;
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error WrongNetwork(uint256 actualChainId);

    function run() external returns (ReportRegistry registry) {
        if (block.chainid != MONAD_TESTNET_CHAIN_ID) {
            revert WrongNetwork(block.chainid);
        }

        uint256 deployerKey = vm.envUint("MONAD_TESTNET_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        registry = new ReportRegistry();
        vm.stopBroadcast();
    }
}
