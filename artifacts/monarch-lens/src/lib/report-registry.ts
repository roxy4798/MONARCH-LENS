/**
 * Monad Testnet release artifact for contracts/src/ReportRegistry.sol.
 * Compiled with solc 0.8.28, optimizer enabled, 200 runs.
 * Re-run `forge inspect ReportRegistry bytecode` and update this constant
 * whenever the Solidity source or compiler settings change.
 */
export const REPORT_REGISTRY_CREATION_BYTECODE =
  '0x6080604052348015600e575f5ffd5b506102108061001c5f395ff3fe608060405234801561000f575f5ffd5b5060043610610034575f3560e01c8063171c4f1114610038578063dd1df92c146100bf575b5f5ffd5b61008b6100463660046101c3565b5f90815260208181526040918290208251808401909352546001600160a01b038116808452600160a01b90910467ffffffffffffffff16929091018290529182151590565b604080516001600160a01b03909416845267ffffffffffffffff909216602084015215159082015260600160405180910390f35b6100d26100cd3660046101c3565b6100d4565b005b806100f25760405163f9bb7cef60e01b815260040160405180910390fd5b5f818152602081905260409020546001600160a01b03161561012e57604051633be57b3960e11b81526004810182905260240160405180910390fd5b6040805180820182523380825267ffffffffffffffff4281811660208086018281525f898152808352889020965187549151909516600160a01b026001600160e01b03199091166001600160a01b0390951694909417939093179094559351928352909184917fce64c7a9b70d4a6fa50ca414ede3b2250539a8422745356e2a26c80af5c1010b910160405180910390a35050565b5f602082840312156101d3575f5ffd5b503591905056fea26469706673582212200f286dca6a261b044b8c125b52557ab91695be4f0981987e6909c0df9f80aba164736f6c634300081c0033';

export const REPORT_REGISTRY_VERSION = '0.1.0';
export const REPORT_REGISTRY_REGISTER_SELECTOR = '0xdd1df92c';
export const REPORT_REGISTRY_GET_SELECTOR = '0x171c4f11';

export function encodeRegisterReport(reportHash: string): string {
  assertBytes32(reportHash);
  return `${REPORT_REGISTRY_REGISTER_SELECTOR}${reportHash.slice(2)}`;
}

export function encodeGetReport(reportHash: string): string {
  assertBytes32(reportHash);
  return `${REPORT_REGISTRY_GET_SELECTOR}${reportHash.slice(2)}`;
}

export function decodeReportRecord(data: string): {
  submitter: string;
  registeredAt: string;
  exists: boolean;
} {
  if (!/^0x[a-fA-F0-9]{192}$/.test(data)) {
    throw new Error('Registry returned data with an unexpected ABI length.');
  }

  const encoded = data.slice(2);
  const submitter = `0x${encoded.slice(24, 64)}`;
  const registeredAt = BigInt(`0x${encoded.slice(64, 128)}`).toString();
  const exists = BigInt(`0x${encoded.slice(128, 192)}`) !== 0n;

  return { submitter, registeredAt, exists };
}

function assertBytes32(value: string): void {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error('Report hash must be a 32-byte 0x-prefixed value.');
  }
}

/**
 * Canonical JSON serialization for deterministic hashing.
 * Sorts object keys recursively at all levels.
 * Arrays preserve their original item ordering.
 * Primitives (string, number, boolean, null) serialize deterministically.
 */
export function stableJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Report data contains a non-JSON value.');
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  throw new Error('Report data contains a value that cannot be serialized.');
}

