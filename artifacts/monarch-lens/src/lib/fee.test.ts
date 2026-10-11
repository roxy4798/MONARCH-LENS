import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatWeiToMon,
  formatGasPrice,
  calculateTransactionFee,
} from './fee';

describe('formatWeiToMon - Decimal Conversion and Precision', () => {
  it('converts exact 1 MON (10^18 wei) to "1 MON"', () => {
    assert.equal(formatWeiToMon(10n ** 18n), '1 MON');
    assert.equal(formatWeiToMon('1000000000000000000'), '1 MON');
  });

  it('converts 0 wei to "0 MON"', () => {
    assert.equal(formatWeiToMon(0n), '0 MON');
    assert.equal(formatWeiToMon('0'), '0 MON');
    assert.equal(formatWeiToMon('0x0'), '0 MON');
  });

  it('converts fractional MON values using 18 decimals and trims trailing zeros', () => {
    // 0.5 MON = 5 * 10^17 wei
    assert.equal(formatWeiToMon(500000000000000000n), '0.5 MON');
    // 0.00105 MON = 1050000000000000 wei
    assert.equal(formatWeiToMon('1050000000000000'), '0.00105 MON');
  });

  it('preserves full precision for small nonzero values so they never display as "0 MON"', () => {
    // 105 Gwei + 1 wei (typical Monad Testnet effective gas price)
    const egpWei = 105000000001n;
    const formatted = formatWeiToMon(egpWei);
    assert.notEqual(formatted, '0 MON', 'Small nonzero gas price must not display as 0 MON');
    assert.equal(formatted, '0.000000105000000001 MON');

    // 1 wei (smallest possible fraction)
    assert.equal(formatWeiToMon(1n), '0.000000000000000001 MON');
  });

  it('handles hex-encoded wei inputs', () => {
    // 0x18727cda01 = 105000000001 wei
    assert.equal(formatWeiToMon('0x18727cda01'), '0.000000105000000001 MON');
  });

  it('returns null for empty, undefined, null, or negative inputs', () => {
    assert.equal(formatWeiToMon(null), null);
    assert.equal(formatWeiToMon(undefined), null);
    assert.equal(formatWeiToMon(''), null);
    assert.equal(formatWeiToMon(-100n), null);
    assert.equal(formatWeiToMon('invalid'), null);
  });
});

describe('formatGasPrice - Gas Price Formatting', () => {
  it('formats nonzero gas price with MON and Gwei precision', () => {
    const formatted = formatGasPrice('0x18727cda01'); // 105000000001 wei
    assert.ok(formatted?.includes('0.000000105000000001 MON'));
    assert.ok(formatted?.includes('105 Gwei'));
    assert.notEqual(formatted, '0 MON');
  });

  it('formats exact 50 Gwei cleanly', () => {
    const formatted = formatGasPrice(50000000000n);
    assert.equal(formatted, '0.00000005 MON (50 Gwei)');
  });

  it('formats 0 wei gas price as "0 MON (0 Gwei)"', () => {
    assert.equal(formatGasPrice('0x0'), '0 MON (0 Gwei)');
    assert.equal(formatGasPrice(0n), '0 MON (0 Gwei)');
  });

  it('returns null for missing gas price', () => {
    assert.equal(formatGasPrice(null), null);
    assert.equal(formatGasPrice(undefined), null);
  });
});

describe('calculateTransactionFee - Execution Fee and Gas Limit Separation', () => {
  it('calculates actual execution fee strictly as gasUsed * effectiveGasPrice', () => {
    // Real Monad testnet tx parameters:
    // gasUsed: 191764 (0x2ed14)
    // effectiveGasPrice: 105000000001 (0x18727cda01)
    const result = calculateTransactionFee({
      gasUsed: '0x2ed14',
      gasLimit: '0x2ed14',
      effectiveGasPrice: '0x18727cda01',
    });

    assert.equal(result.gasUsed, 191764n);
    assert.equal(result.effectiveGasPrice, 105000000001n);
    // 191764 * 105000000001 = 20135220000191764 wei
    assert.equal(result.actualFeeWei, 20135220000191764n);
    assert.equal(result.actualFeeFormatted, '0.020135220000191764 MON');
  });

  it('strictly distinguishes actual execution fee from gas limit when gasUsed < gasLimit', () => {
    // Example: gasLimit is 500,000, but only 21,000 gas was used
    const result = calculateTransactionFee({
      gasUsed: '21000',
      gasLimit: '500000',
      effectiveGasPrice: '105000000000', // 105 Gwei
    });

    // Actual fee MUST be based on 21000, NOT 500000
    const expectedActualFee = 21000n * 105000000000n; // 2205000000000000 wei = 0.002205 MON
    assert.equal(result.actualFeeWei, expectedActualFee);
    assert.equal(result.actualFeeFormatted, '0.002205 MON');

    // Max fee estimate MUST be based on 500000
    const expectedMaxFee = 500000n * 105000000000n; // 52500000000000000 wei = 0.0525 MON
    assert.equal(result.maxFeeEstimateWei, expectedMaxFee);
    assert.equal(result.maxFeeEstimateFormatted, '0.0525 MON');

    assert.notEqual(result.actualFeeWei, result.maxFeeEstimateWei);
  });

  it('returns null for actual fee when effectiveGasPrice is missing (does not fabricate fee)', () => {
    const result = calculateTransactionFee({
      gasUsed: '191764',
      gasLimit: '191764',
      effectiveGasPrice: null,
    });

    assert.equal(result.actualFeeWei, null);
    assert.equal(result.actualFeeFormatted, null);
    assert.equal(result.effectiveGasPriceFormatted, null);
  });

  it('handles pending transaction (missing receipt) safely without fabrication', () => {
    const result = calculateTransactionFee({
      gasLimit: '100000',
      maxFeePerGas: '200000000000', // 200 Gwei
      // No receipt data:
      gasUsed: null,
      effectiveGasPrice: null,
    });

    // Actual execution fee is unavailable until receipt
    assert.equal(result.actualFeeWei, null);
    assert.equal(result.actualFeeFormatted, null);

    // Max fee estimate is available based on gas limit and maxFeePerGas
    assert.equal(result.maxFeeEstimateWei, 100000n * 200000000000n); // 20000000000000000 wei = 0.02 MON
    assert.equal(result.maxFeeEstimateFormatted, '0.02 MON');
  });

  it('handles reverted transaction: gasUsed is charged and fee is accurately calculated', () => {
    // Reverted transactions still consume gas onchain
    const result = calculateTransactionFee({
      gasUsed: '85000',
      gasLimit: '100000',
      effectiveGasPrice: '100000000000', // 100 Gwei
    });

    assert.equal(result.actualFeeWei, 85000n * 100000000000n);
    assert.equal(result.actualFeeFormatted, '0.0085 MON');
  });

  it('handles zero-gas system transactions accurately', () => {
    const result = calculateTransactionFee({
      gasUsed: '0x0',
      gasLimit: '0x0',
      effectiveGasPrice: '0x0',
    });

    assert.equal(result.actualFeeWei, 0n);
    assert.equal(result.actualFeeFormatted, '0 MON');
    assert.equal(result.effectiveGasPriceFormatted, '0 MON (0 Gwei)');
  });
});
