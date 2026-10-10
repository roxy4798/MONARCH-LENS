// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ReportRegistry
/// @notice Stores a one-way commitment to a benchmark report.
/// @dev A registered hash proves content matches the commitment, not that the
///      report's claims or external inputs are truthful.
contract ReportRegistry {
    /// @notice A report hash must not be the zero value.
    error InvalidReportHash();

    /// @notice A report hash can only be registered once.
    error AlreadyRegistered(bytes32 reportHash);

    /// @notice Emitted after a report hash is committed to the registry.
    /// @param reportHash SHA-256 report digest interpreted as bytes32.
    /// @param submitter Address that submitted the commitment.
    /// @param registeredAt Block timestamp at registration.
    event ReportRegistered(
        bytes32 indexed reportHash,
        address indexed submitter,
        uint64 registeredAt
    );

    struct ReportRecord {
        address submitter;
        uint64 registeredAt;
    }

    mapping(bytes32 reportHash => ReportRecord record) private reportRecords;

    /// @notice Register a report hash once.
    /// @param reportHash SHA-256 digest of the deterministically serialized report.
    function registerReport(bytes32 reportHash) external {
        if (reportHash == bytes32(0)) revert InvalidReportHash();
        if (reportRecords[reportHash].submitter != address(0)) {
            revert AlreadyRegistered(reportHash);
        }

        uint64 registeredAt = uint64(block.timestamp);
        reportRecords[reportHash] = ReportRecord({
            submitter: msg.sender,
            registeredAt: registeredAt
        });

        emit ReportRegistered(reportHash, msg.sender, registeredAt);
    }

    /// @notice Look up an onchain report commitment.
    /// @param reportHash SHA-256 digest to check.
    /// @return submitter Account that registered the report, or zero if absent.
    /// @return registeredAt Registration block timestamp, or zero if absent.
    /// @return exists Whether a record is present.
    function getReport(
        bytes32 reportHash
    )
        external
        view
        returns (address submitter, uint64 registeredAt, bool exists)
    {
        ReportRecord memory record = reportRecords[reportHash];
        return (
            record.submitter,
            record.registeredAt,
            record.submitter != address(0)
        );
    }
}
