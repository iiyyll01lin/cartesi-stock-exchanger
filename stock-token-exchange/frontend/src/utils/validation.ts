// Input validation functions

/**
 * Validate an amount input
 */
export function validateAmount(amount: string): string | null {
  if (!amount) {
    return 'Amount is required';
  }
  
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount)) {
    return 'Amount must be a valid number';
  }
  
  if (numAmount <= 0) {
    return 'Amount must be greater than 0';
  }
  
  return null;
}

/**
 * Validate a price input
 */
export function validatePrice(price: string): string | null {
  if (!price) {
    return 'Price is required';
  }
  
  const numPrice = parseFloat(price);
  if (isNaN(numPrice)) {
    return 'Price must be a valid number';
  }
  
  if (numPrice <= 0) {
    return 'Price must be greater than 0';
  }
  
  return null;
}
