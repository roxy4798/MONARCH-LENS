import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  encodeRegisterReport,
  encodeGetReport,
  decodeReportRecord,
  REPORT_REGISTRY_CREATION_BYTECODE,
  REPORT_REGISTRY_VERSION,
  REPORT_REGISTRY_REGISTER_SELECTOR,
  REPORT_REGISTRY_GET_SELECTOR,
  stableJson,
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

describe('Canonical JSON Serialization and Deterministic Hashing', () => {
  it('serializes primitives identically', () => {
    assert.equal(stableJson(null), 'null');
    assert.equal(stableJson('hello'), '"hello"');
    assert.equal(stableJson(42), '42');
    assert.equal(stableJson(true), 'true');
    assert.equal(stableJson(false), 'false');
  });

  it('sorts object keys in lexicographical order regardless of insertion order', () => {
    const objA = { z: 1, a: 2, m: 3 };
    const objB = { a: 2, m: 3, z: 1 };
    const expected = '{"a":2,"m":3,"z":1}';
    assert.equal(stableJson(objA), expected);
    assert.equal(stableJson(objB), expected);
  });

  it('recursively sorts nested objects while preserving array ordering', () => {
    const complexA = {
      runs: [{ id: 2, success: true }, { id: 1, success: false }],
      meta: { version: '0.1.0', author: 'roxy4798' },
      network: { name: 'Monad Testnet', chainId: 10143 },
    };
    const complexB = {
      network: { chainId: 10143, name: 'Monad Testnet' },
      meta: { author: 'roxy4798', version: '0.1.0' },
      runs: [{ success: true, id: 2 }, { success: false, id: 1 }],
    };
    const serializedA = stableJson(complexA);
    const serializedB = stableJson(complexB);
    assert.equal(serializedA, serializedB);

    // Array element order must remain intact (not sorted)
    assert.ok(serializedA.includes('"runs":[{"id":2,"success":true},{"id":1,"success":false}]'));
  });

  it('produces identical SHA-256 hashes regardless of whitespace or key ordering in original JSON', () => {
    const rawFormattedJson = `{\n  "scenario": "report-registry-write",\n  "chainId": 10143,\n  "success": true\n}`;
    const rawUnformattedJson = `{"success":true,"scenario":"report-registry-write","chainId":10143}`;

    const canonical1 = stableJson(JSON.parse(rawFormattedJson));
    const canonical2 = stableJson(JSON.parse(rawUnformattedJson));
    assert.equal(canonical1, canonical2);

    const hash1 = '0x' + crypto.createHash('sha256').update(canonical1).digest('hex');
    const hash2 = '0x' + crypto.createHash('sha256').update(canonical2).digest('hex');
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 66);
    assert.ok(/^0x[0-9a-f]{64}$/.test(hash1));
  });

  it('throws when encountering non-serializable values', () => {
    assert.throws(() => stableJson(undefined), /cannot be serialized|non-JSON/);
    assert.throws(() => stableJson({ fn: () => {} }), /cannot be serialized|non-JSON/);
  });
});

