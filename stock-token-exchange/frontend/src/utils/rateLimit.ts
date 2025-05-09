// filepath: /mnt/d/workspace/cartesi-stock-exchange/stock-token-exchange/frontend/src/utils/rateLimit.ts
/**
 * Utility functions for rate limiting and throttling requests
 */

/**
 * Creates a debounced function that delays invoking the provided function
 * until after the specified wait time has elapsed since the last time it was invoked.
 * @param func The function to debounce
 * @param wait The wait time in milliseconds
 * @returns The debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number = 300
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Parameters<T>): void {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

/**
 * Creates a throttled function that only invokes the provided function
 * at most once per every specified time period.
 * @param func The function to throttle
 * @param limit The time period in milliseconds
 * @returns The throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number = 300
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;
  let lastArgs: Parameters<T> | null = null;
  
  return function(...args: Parameters<T>): void {
    lastArgs = args;
    
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs !== args) {
          func(...lastArgs!);
        }
      }, limit);
    }
  };
}

/**
 * Creates a rate-limited queue that processes functions at a controlled rate
 * @param maxRequestsPerSecond Maximum number of requests allowed per second
 * @returns An object with methods to enqueue functions and check queue status
 */
export function createRateLimitedQueue(maxRequestsPerSecond: number = 5) {
  const queue: (() => Promise<any>)[] = [];
  let isProcessing = false;
  const intervalMs = 1000 / maxRequestsPerSecond;
  
  const processQueue = async () => {
    if (isProcessing || queue.length === 0) return;
    
    isProcessing = true;
    
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          console.error("Error executing queued task:", error);
        }
        
        // Wait before processing next item
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }
    
    isProcessing = false;
  };
  
  return {
    enqueue: (task: () => Promise<any>) => {
      queue.push(task);
      processQueue();
    },
    getQueueLength: () => queue.length,
    isProcessing: () => isProcessing
  };
}
