import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeRegisterReport,
  encodeGetReport,
  decodeReportRecord,
  REPORT_REGISTRY_CREATION_BYTECODE,
  REPORT_REGISTRY_VERSION,
  REPORT_REGISTRY_REGISTER_SELECTOR,
  REPORT_REGISTRY_GET_SELECTOR,
} from './report-registry.js';

describe('ReportRegistry ABI Helpers', () => {
  const sampleHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  it('exposes contract version and bytecode', () => {
    assert.equal(REPORT_REGISTRY_VERSION, '0.1.0');
    assert.ok(REPORT_REGISTRY_CREATION_BYTECODE.startsWith('0x6080604052348015'));
  });

  it('encodes registerReport calldata with expected selector', () => {
    const calldata = encodeRegisterReport(sampleHash);
    assert.equal(calldata.slice(0, 10), REPORT_REGISTRY_REGISTER_SELECTOR);
    assert.equal(calldata, `${REPORT_REGISTRY_REGISTER_SELECTOR}${sampleHash.slice(2)}`);
  });

  it('encodes getReport calldata with expected selector', () => {
    const calldata = encodeGetReport(sampleHash);
    assert.equal(calldata.slice(0, 10), REPORT_REGISTRY_GET_SELECTOR);
    assert.equal(calldata, `${REPORT_REGISTRY_GET_SELECTOR}${sampleHash.slice(2)}`);
  });

  it('rejects invalid hash length or non-hex string', () => {
    assert.throws(() => encodeRegisterReport('0x1234'), /Report hash must be a 32-byte/);
    assert.throws(() => encodeRegisterReport('not-a-hash'), /Report hash must be a 32-byte/);
    assert.throws(() => encodeGetReport('0x' + 'g'.repeat(64)), /Report hash must be a 32-byte/);
  });

  it('decodes a valid report record tuple from RPC response', () => {
    // 32 bytes submitter address (padded) + 32 bytes uint64 timestamp + 32 bytes bool exists
    const submitterPart = '0000000000000000000000001111111111111111111111111111111111111111';
    const timestampPart = '0000000000000000000000000000000000000000000000000000000067000000';
    const existsPart = '0000000000000000000000000000000000000000000000000000000000000001';
    const rawData = `0x${submitterPart}${timestampPart}${existsPart}`;

    const record = decodeReportRecord(rawData);
    assert.equal(record.submitter.toLowerCase(), '0x1111111111111111111111111111111111111111');
    assert.equal(record.registeredAt, BigInt('0x67000000').toString());
    assert.equal(record.exists, true);
  });

  it('throws on invalid tuple byte length when decoding record', () => {
    assert.throws(() => decodeReportRecord('0x1234'), /unexpected ABI length/);
  });
});
