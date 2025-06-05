const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("Starting gas usage analysis...");
  
  // Deploy contracts
  const [owner, addr1, addr2] = await ethers.getSigners();
  
  // Deploy MockCartesiCompute
  const MockCartesiCompute = await ethers.getContractFactory("MockCartesiCompute");
  const mockCartesiCompute = await MockCartesiCompute.deploy();
  await mockCartesiCompute.deployed();
  console.log("MockCartesiCompute deployed to:", mockCartesiCompute.address);
  
  // Load template hash
  let templateHash;
  const templateHashPath = path.join(__dirname, "..", "cartesi-machine", "template-hash.txt");
  try {
    templateHash = fs.readFileSync(templateHashPath, "utf8").trim();
    if (!templateHash.startsWith("0x") || templateHash.length !== 66) {
        console.warn(`Invalid template hash read: ${templateHash} from ${templateHashPath}. Using default.`);
        templateHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
    }
  } catch (error) {
    console.error(`Failed to read template hash from ${templateHashPath}, using default:`, error);
    templateHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
  }
  console.log("Using template hash:", templateHash);

  // Deploy StockToken
  const StockToken = await ethers.getContractFactory("StockToken");
  const stockToken = await StockToken.deploy("Gas Test Token", "GTT", owner.address);
  await stockToken.deployed();
  console.log("StockToken deployed to:", stockToken.address);
  
  // Mint tokens for testing
  const baseTokenAmount = ethers.parseUnits("100000", 18);
  await stockToken.connect(owner).mint(owner.address, baseTokenAmount.mul(5)); // Mint a large amount to owner
  await stockToken.connect(owner).transfer(addr1.address, baseTokenAmount);
  await stockToken.connect(owner).transfer(addr2.address, baseTokenAmount);

  // Create trade data for various batch sizes
  const batchSizes = [1, 5, 10, 20, 50, 100]; // Adjusted batch sizes for more granular testing
  const results = [];
  
  // Generate matched trades data (up to 100 trades for max batch size)
  const maxTradesForTest = 100;
  const matchedTradesArray = [];
  const tokenPerTrade = ethers.parseUnits("1", 18);
  const pricePerTrade = ethers.parseEther("0.01");
  const ethPerTrade = tokenPerTrade.mul(pricePerTrade).div(ethers.parseUnits("1", 18));
  const totalEthCostForTrades = ethPerTrade.mul(maxTradesForTest);

  console.log("Setting up orders and deposits for gas analysis...");
  // Pre-approve and deposit for seller (addr1)
  await stockToken.connect(addr1).approve(ethers.constants.AddressZero, ethers.constants.MaxUint256); // Approve a dummy address first to reset any existing allowance
  await stockToken.connect(addr1).approve(ethers.constants.AddressZero, 0); // then approve zero to ensure clean state
  await stockToken.connect(addr1).approve(ethers.constants.AddressZero, ethers.constants.MaxUint256); // Approve a dummy address first to reset any existing allowance
  await stockToken.connect(addr1).approve(ethers.constants.AddressZero, 0); // then approve zero to ensure clean state
  await stockToken.connect(addr1).approve(ethers.constants.AddressZero, ethers.constants.MaxUint256);
  await stockToken.connect(addr1).approve(ethers.constants.AddressZero, 0);
  await stockToken.connect(addr1).approve(ethers.constants.AddressZero, ethers.constants.MaxUint256);
  await stockToken.connect(addr1).approve(ethers.constants.AddressZero, 0);
  await stockToken.connect(addr1).approve(ethers.constants.AddressZero, ethers.constants.MaxUint256);
  await stockToken.connect(addr1).approve(ethers.constants.AddressZero, 0);

  // Deploy a fresh Exchange contract for the entire gas analysis to ensure clean state
  const Exchange = await ethers.getContractFactory("Exchange");
  const exchange = await Exchange.deploy(mockCartesiCompute.address, templateHash);
  await exchange.deployed();
  console.log("Fresh Exchange contract deployed for gas analysis at:", exchange.address);

  await stockToken.connect(addr1).approve(exchange.address, baseTokenAmount); 
  await exchange.connect(addr1).depositToken(stockToken.address, baseTokenAmount);
  
  // Pre-deposit ETH for buyer (addr2)
  await exchange.connect(addr2).depositETH({ value: totalEthCostForTrades.mul(2) }); // Deposit more than enough

  const buyOrderIds = [];
  const sellOrderIds = [];

  for (let i = 0; i < maxTradesForTest; i++) {
    const sellTx = await exchange.connect(addr1).placeOrder(stockToken.address, tokenPerTrade, pricePerTrade.add(i), true); // Assuming isBuyOrder: true for sell
    const sellRec = await sellTx.wait();
    sellOrderIds.push(sellRec.events.find(e=>e.event === "OrderPlaced").args.id);

    const buyTx = await exchange.connect(addr2).placeOrder(stockToken.address, tokenPerTrade, pricePerTrade.add(i), false);
    const buyRec = await buyTx.wait();
    buyOrderIds.push(buyRec.events.find(e=>e.event === "OrderPlaced").args.id);

    matchedTradesArray.push({
      buyOrderId: buyOrderIds[i],
      sellOrderId: sellOrderIds[i],
      buyer: addr2.address,
      seller: addr1.address,
      token: stockToken.address,
      price: pricePerTrade.add(i),
      amount: tokenPerTrade
    });
  }
  console.log(`Created ${matchedTradesArray.length} orders and potential matches.`);

  const encodedMatchedTrades = ethers.utils.defaultAbiCoder.encode(
    ["tuple(uint256 buyOrderId, uint256 sellOrderId, address buyer, address seller, address token, uint256 price, uint256 amount)[]"],
    [matchedTradesArray.map(t => [t.buyOrderId, t.sellOrderId, t.buyer, t.seller, t.token, t.price, t.amount])]
  );

  const baseCartesiIndex = 2000; // Use a high base index to avoid collision with unit tests

  console.log("\nTesting Gas Usage for Batch Processing Functions");
  console.log("===============================================");
  console.log("BatchSz | Func Type   | Gas Used | Trades | Gas/Trade | Status");
  console.log("-----------------------------------------------------------------");

  for (const batchSize of batchSizes) {
    if (batchSize > maxTradesForTest) continue;

    // Test processMatchResultWithLimit
    let cartesiIdxNormal = baseCartesiIndex + batchSize * 2;
    await mockCartesiCompute.setResult(cartesiIdxNormal, false, true, ethers.utils.formatBytes32String(`norm-${batchSize}`), encodedMatchedTrades);
    await exchange.connect(owner).setLastProcessedTradeIndexForTest(cartesiIdxNormal, 0); // Reset for this test
    try {
      const txNormal = await exchange.connect(owner).processMatchResultWithLimit(cartesiIdxNormal, batchSize);
      const receiptNormal = await txNormal.wait();
      const gasUsedNormal = receiptNormal.gasUsed.toNumber();
      const tradesProcessedNormal = (await exchange.getProcessingStatus(cartesiIdxNormal)).toNumber();
      const gasPerTradeNormal = tradesProcessedNormal > 0 ? Math.round(gasUsedNormal / tradesProcessedNormal) : 0;
      console.log(
        `${batchSize.toString().padEnd(7)} | Normal      | ${gasUsedNormal.toString().padEnd(8)} | ${tradesProcessedNormal.toString().padEnd(6)} | ${gasPerTradeNormal.toString().padEnd(9)} | Success`
      );
      results.push({ type: "Normal", batchSize, gasUsed: gasUsedNormal, tradesProcessed: tradesProcessedNormal, gasPerTrade: gasPerTradeNormal, status: "Success" });
    } catch (e) {
      console.log(
        `${batchSize.toString().padEnd(7)} | Normal      | ${"N/A".padEnd(8)} | ${"N/A".padEnd(6)} | ${ "N/A".padEnd(9)} | Error: ${e.message.substring(0,30)}`
      );
      results.push({ type: "Normal", batchSize, gasUsed: 0, tradesProcessed: 0, gasPerTrade: 0, status: "Error" });
    }

    // Test processPrioritizedMatchResult
    let cartesiIdxPrio = baseCartesiIndex + batchSize * 2 + 1;
    await mockCartesiCompute.setResult(cartesiIdxPrio, false, true, ethers.utils.formatBytes32String(`prio-${batchSize}`), encodedMatchedTrades);
    await exchange.connect(owner).setLastProcessedTradeIndexForTest(cartesiIdxPrio, 0); // Reset for this test
    try {
      const txPrio = await exchange.connect(owner).processPrioritizedMatchResult(cartesiIdxPrio, batchSize);
      const receiptPrio = await txPrio.wait();
      const gasUsedPrio = receiptPrio.gasUsed.toNumber();
      // lastProcessedTradeIndex might behave differently with prioritization, let's count TradeExecuted events for accuracy
      const tradeExecutedEvents = receiptPrio.events.filter(e => e.event === "TradeExecuted");
      const tradesProcessedPrio = tradeExecutedEvents.length;
      const gasPerTradePrio = tradesProcessedPrio > 0 ? Math.round(gasUsedPrio / tradesProcessedPrio) : 0;
      console.log(
        `${batchSize.toString().padEnd(7)} | Prioritized | ${gasUsedPrio.toString().padEnd(8)} | ${tradesProcessedPrio.toString().padEnd(6)} | ${gasPerTradePrio.toString().padEnd(9)} | Success`
      );
      results.push({ type: "Prioritized", batchSize, gasUsed: gasUsedPrio, tradesProcessed: tradesProcessedPrio, gasPerTrade: gasPerTradePrio, status: "Success" });
    } catch (e) {
      console.log(
        `${batchSize.toString().padEnd(7)} | Prioritized | ${ "N/A".padEnd(8)} | ${"N/A".padEnd(6)} | ${ "N/A".padEnd(9)} | Error: ${e.message.substring(0,30)}`
      );
      results.push({ type: "Prioritized", batchSize, gasUsed: 0, tradesProcessed: 0, gasPerTrade: 0, status: "Error" });
    }
  }
  console.log("-----------------------------------------------------------------");

  // Save results to a file
  const resultsPath = path.join(__dirname, "gas-analysis-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nGas analysis complete. Results saved to: ${resultsPath}`);

  // Provide recommendations based on results
  const successfulNormalRuns = results.filter(r => r.type === "Normal" && r.status === "Success" && r.tradesProcessed > 0);
  if (successfulNormalRuns.length > 0) {
    const mostEfficientNormal = successfulNormalRuns.sort((a,b) => a.gasPerTrade - b.gasPerTrade)[0];
    console.log(`Recommendation (Normal): Batch size ${mostEfficientNormal.batchSize} was most gas-efficient per trade (${mostEfficientNormal.gasPerTrade} gas/trade).`);
  }
  const successfulPrioRuns = results.filter(r => r.type === "Prioritized" && r.status === "Success" && r.tradesProcessed > 0);
  if (successfulPrioRuns.length > 0) {
    const mostEfficientPrio = successfulPrioRuns.sort((a,b) => a.gasPerTrade - b.gasPerTrade)[0];
    console.log(`Recommendation (Prioritized): Batch size ${mostEfficientPrio.batchSize} was most gas-efficient per trade (${mostEfficientPrio.gasPerTrade} gas/trade).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
