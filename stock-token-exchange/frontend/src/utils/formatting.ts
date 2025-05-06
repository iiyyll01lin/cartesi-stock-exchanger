// Formatting utility functions

/**
 * Format an address to a shortened version
 */
export function formatAddress(address: string, startChars = 6, endChars = 4): string {
  if (!address) return '';
  return `${address.substring(0, startChars)}...${address.substring(address.length - endChars)}`;
}

/**
 * Format a number to a fixed number of decimal places
 */
export function formatNumber(value: string | number, decimals = 4): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '0';
  return numValue.toFixed(decimals);
}

/**
 * Format a timestamp to a readable date string
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
