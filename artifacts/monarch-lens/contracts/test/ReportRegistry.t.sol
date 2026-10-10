// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../src/ReportRegistry.sol";

interface Vm {
    function expectEmit(
        bool checkTopic1,
        bool checkTopic2,
        bool checkTopic3,
        bool checkData,
        address emitter
    ) external;

    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
}

contract ReportRegistryTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ReportRegistry private registry;

    event ReportRegistered(
        bytes32 indexed reportHash,
        address indexed submitter,
        uint64 registeredAt
    );

    function setUp() public {
        registry = new ReportRegistry();
    }

    function testRegistersHashAndStoresSubmitterAndTimestamp() public {
        bytes32 reportHash = keccak256("benchmark-report");
        uint64 expectedTimestamp = uint64(block.timestamp);

        vm.expectEmit(true, true, false, true, address(registry));
        emit ReportRegistered(reportHash, address(this), expectedTimestamp);

        registry.registerReport(reportHash);

        (address submitter, uint64 registeredAt, bool exists) = registry
            .getReport(reportHash);
        require(exists, "record should exist");
        require(submitter == address(this), "submitter should be caller");
        require(registeredAt == expectedTimestamp, "timestamp should be stored");
    }

    function testRejectsZeroHash() public {
        vm.expectRevert(ReportRegistry.InvalidReportHash.selector);
        registry.registerReport(bytes32(0));
    }

    function testRejectsDuplicateHash() public {
        bytes32 reportHash = keccak256("duplicate-report");
        registry.registerReport(reportHash);

        vm.expectRevert(
            abi.encodeWithSelector(
                ReportRegistry.AlreadyRegistered.selector,
                reportHash
            )
        );
        registry.registerReport(reportHash);
    }

    function testUnregisteredHashReturnsEmptyRecord() public view {
        (address submitter, uint64 registeredAt, bool exists) = registry
            .getReport(keccak256("missing-report"));
        require(!exists, "record should not exist");
        require(submitter == address(0), "submitter should be zero");
        require(registeredAt == 0, "timestamp should be zero");
    }
}
