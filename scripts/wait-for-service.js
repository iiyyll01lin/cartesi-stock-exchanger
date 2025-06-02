#!/usr/bin/env node
/**
 * Simple service availability checker using Node.js built-in modules
 * Usage: node wait-for-service.js <host> <port> [timeout_seconds]
 */

const net = require('net');

function checkConnection(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(timeoutMs);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

async function waitForService(host, port, timeoutSeconds = 60) {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;
  
  console.log(`Waiting for ${host}:${port} to be available (timeout: ${timeoutSeconds}s)...`);
  
  while (Date.now() - startTime < timeoutMs) {
    if (await checkConnection(host, port)) {
      console.log(`✓ ${host}:${port} is available`);
      process.exit(0);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`✗ ${host}:${port} is not available after ${timeoutSeconds} seconds`);
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node wait-for-service.js <host> <port> [timeout_seconds]');
  process.exit(1);
}

const host = args[0];
const port = parseInt(args[1]);
const timeout = args[2] ? parseInt(args[2]) : 60;

if (isNaN(port) || port <= 0 || port > 65535) {
  console.error('Error: Port must be a valid number between 1 and 65535');
  process.exit(1);
}

if (isNaN(timeout) || timeout <= 0) {
  console.error('Error: Timeout must be a positive number');
  process.exit(1);
}

waitForService(host, port, timeout).catch(error => {
  console.error('Unexpected error:', error.message);
  process.exit(1);
});
