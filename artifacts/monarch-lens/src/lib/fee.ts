/**
 * Fee calculation and formatting utilities for Monad Testnet transactions.
 * Converts wei values to MON using 18 decimals and formats gas prices accurately.
 */

export function formatWeiToMon(
  weiInput: string | bigint | number | null | undefined,
  maxDecimals = 18
): string | null {
  if (weiInput === null || weiInput === undefined || weiInput === '') return null;
  try {
    const wei = typeof weiInput === 'bigint'
      ? weiInput
      : BigInt(typeof weiInput === 'number' ? Math.floor(weiInput) : weiInput);
    if (wei < 0n) return null;
    if (wei === 0n) return '0 MON';

    const unit = 10n ** 18n;
    const whole = (wei / unit).toString();
    const remainder = wei % unit;

    if (remainder === 0n) return `${whole} MON`;

    const fullFraction = remainder.toString().padStart(18, '0');
    let fraction = fullFraction.slice(0, maxDecimals).replace(/0+$/, '');

    // Safety guard: if maxDecimals truncation stripped all significant non-zero digits,
    // preserve significant digits so a non-zero value never incorrectly displays as 0 MON.
    if (fraction === '') {
      fraction = fullFraction.replace(/0+$/, '');
    }

    return `${whole}.${fraction} MON`;
  } catch {
    return null;
  }
}

export function formatGasPrice(
  priceInput: string | bigint | number | null | undefined
): string | null {
  if (priceInput === null || priceInput === undefined || priceInput === '') return null;
  try {
    const wei = typeof priceInput === 'bigint'
      ? priceInput
      : BigInt(typeof priceInput === 'number' ? Math.floor(priceInput) : priceInput);
    if (wei < 0n) return null;
    if (wei === 0n) return '0 MON (0 Gwei)';

    const monStr = formatWeiToMon(wei);
    const gweiUnit = 10n ** 9n;
    const gweiWhole = (wei / gweiUnit).toString();
    const gweiRem = (wei % gweiUnit).toString().padStart(9, '0').slice(0, 3).replace(/0+$/, '');
    const gweiStr = gweiRem ? `${gweiWhole}.${gweiRem}` : gweiWhole;

    return `${monStr} (${gweiStr} Gwei)`;
  } catch {
    return null;
  }
}

export type FeeCalculationParams = {
  gasUsed?: string | null;
  gasLimit?: string | null;
  effectiveGasPrice?: string | null;
  maxFeePerGas?: string | null;
  gasPrice?: string | null;
};

export type FeeCalculationResult = {
  gasUsed: bigint | null;
  gasLimit: bigint | null;
  effectiveGasPrice: bigint | null;
  actualFeeWei: bigint | null;
  actualFeeFormatted: string | null;
  maxFeeEstimateWei: bigint | null;
  maxFeeEstimateFormatted: string | null;
  effectiveGasPriceFormatted: string | null;
};

export function calculateTransactionFee(params: FeeCalculationParams): FeeCalculationResult {
  let gasUsedBig: bigint | null = null;
  let gasLimitBig: bigint | null = null;
  let effectiveGasPriceBig: bigint | null = null;

  try {
    if (params.gasUsed !== undefined && params.gasUsed !== null && params.gasUsed !== '') {
      gasUsedBig = BigInt(params.gasUsed);
    }
  } catch {
    gasUsedBig = null;
  }

  try {
    if (params.gasLimit !== undefined && params.gasLimit !== null && params.gasLimit !== '') {
      gasLimitBig = BigInt(params.gasLimit);
    }
  } catch {
    gasLimitBig = null;
  }

  try {
    if (
      params.effectiveGasPrice !== undefined &&
      params.effectiveGasPrice !== null &&
      params.effectiveGasPrice !== ''
    ) {
      effectiveGasPriceBig = BigInt(params.effectiveGasPrice);
    }
  } catch {
    effectiveGasPriceBig = null;
  }

  // Requirement 1 & 2:
  // Actual execution fee is STRICTLY receipt.gasUsed * receipt.effectiveGasPrice.
  // Never substitute gas limit for gas used in actual execution fee.
  let actualFeeWei: bigint | null = null;
  let actualFeeFormatted: string | null = null;

  if (gasUsedBig !== null && effectiveGasPriceBig !== null) {
    actualFeeWei = gasUsedBig * effectiveGasPriceBig;
    actualFeeFormatted = formatWeiToMon(actualFeeWei);
  }

  // Requirement 4:
  // Maximum fee estimate is derived from gas limit and available price parameters.
  let maxFeeEstimateWei: bigint | null = null;
  let maxFeeEstimateFormatted: string | null = null;

  if (gasLimitBig !== null) {
    let maxPriceBig: bigint | null = null;
    try {
      if (params.maxFeePerGas) {
        maxPriceBig = BigInt(params.maxFeePerGas);
      } else if (params.gasPrice) {
        maxPriceBig = BigInt(params.gasPrice);
      } else if (effectiveGasPriceBig !== null) {
        maxPriceBig = effectiveGasPriceBig;
      }
    } catch {
      maxPriceBig = null;
    }

    if (maxPriceBig !== null) {
      maxFeeEstimateWei = gasLimitBig * maxPriceBig;
      maxFeeEstimateFormatted = formatWeiToMon(maxFeeEstimateWei);
    }
  }

  const effectiveGasPriceFormatted = formatGasPrice(effectiveGasPriceBig);

  return {
    gasUsed: gasUsedBig,
    gasLimit: gasLimitBig,
    effectiveGasPrice: effectiveGasPriceBig,
    actualFeeWei,
    actualFeeFormatted,
    maxFeeEstimateWei,
    maxFeeEstimateFormatted,
    effectiveGasPriceFormatted,
  };
}
