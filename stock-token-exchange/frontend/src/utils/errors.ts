// Error handling utilities

/**
 * Handle and format an error to a user-friendly message
 */
export function handleError(error: any, context = ''): string {
  if (!error) return 'An unknown error occurred';
  
  // Handle user rejection of transaction
  if (error.code === 4001) {
    return 'Transaction rejected by user';
  }
  
  // Handle network mismatch
  if (error.message && error.message.includes('Network mismatch')) {
    return `Network mismatch: ${error.message}`;
  }
  
  if (error.message && error.message.includes('insufficient funds')) {
    return 'Insufficient funds for this transaction';
  }
  
  const prefix = context ? `${context}: ` : '';
  return `${prefix}${error.message || 'An unknown error occurred'}`;
}
