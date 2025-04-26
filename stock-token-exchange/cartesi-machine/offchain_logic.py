import sys
import json
import collections

# Structure expected for input orders (adjust as needed)
# {
#   "buy_orders": [ {"id": 1, "user": "0x...", "token": "0x...", "amount": 100, "price": 50, "active": true}, ...],
#   "sell_orders": [ {"id": 2, "user": "0x...", "token": "0x...", "amount": 150, "price": 49, "active": true}, ...]
# }

# Structure for output trades
# [
#   {"buyOrderId": 1, "sellOrderId": 2, "token": "0x...", "amount": 100, "price": 49}, ...
# ]

def match_orders(orders_data):
    """
    Price-Time Priority matching algorithm.
    Matches orders for the same token only.
    """
    matched_trades = []
    buy_orders = orders_data.get("buy_orders", [])
    sell_orders = orders_data.get("sell_orders", [])

    # Group orders by token
    buy_by_token = collections.defaultdict(list)
    sell_by_token = collections.defaultdict(list)

    for order in buy_orders:
        if order.get("active", False):  # Process only active orders
             buy_by_token[order["token"]].append(order)

    for order in sell_orders:
         if order.get("active", False):  # Process only active orders
            sell_by_token[order["token"]].append(order)

    # Process each token separately
    for token, buys in buy_by_token.items():
        if token not in sell_by_token:
            continue

        sells = sell_by_token[token]

        # Sort: Buys highest price first, Sells lowest price first (time priority via list order)
        buys.sort(key=lambda x: x["price"], reverse=True)
        sells.sort(key=lambda x: x["price"])

        buy_idx = 0
        sell_idx = 0

        while buy_idx < len(buys) and sell_idx < len(sells):
            buy_order = buys[buy_idx]
            sell_order = sells[sell_idx]

            if buy_order["price"] >= sell_order["price"]:
                # Match found
                trade_amount = min(buy_order["amount"], sell_order["amount"])
                execution_price = sell_order["price"]  # Execute at seller's asking price (simple model)

                matched_trades.append({
                    "buyOrderId": buy_order["id"],
                    "sellOrderId": sell_order["id"],
                    "token": token,
                    "amount": trade_amount,
                    "price": execution_price
                })

                # Update remaining amounts (in-memory for this matching round)
                buy_order["amount"] -= trade_amount
                sell_order["amount"] -= trade_amount

                # Move to next order if one is fully filled
                if buy_order["amount"] == 0:
                    buy_idx += 1
                if sell_order["amount"] == 0:
                    sell_idx += 1
            else:
                # No match possible at current prices (highest buy < lowest sell)
                break  # Since orders are sorted

    print(f"Debug: Matched {len(matched_trades)} trades.", file=sys.stderr)
    return matched_trades

if __name__ == "__main__":
    print("Offchain logic started.", file=sys.stderr)
    # In a real Cartesi machine, input/output might use specific paths
    # like /mnt/input/data.json and /mnt/output/result.json
    
    try:
        # In Cartesi, we would read from a specific input drive
        input_payload = sys.stdin.read()
        print(f"Debug: Received input payload ({len(input_payload)} bytes).", file=sys.stderr)
        
        # Parse the input JSON data
        order_book = json.loads(input_payload)
        print("Debug: Input JSON parsed successfully.", file=sys.stderr)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON input - {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error processing input: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        # Execute the matching algorithm
        trades = match_orders(order_book)
        print("Debug: Order matching complete.", file=sys.stderr)
    except Exception as e:
        print(f"Error during order matching: {e}", file=sys.stderr)
        sys.exit(1)

    # Output results as JSON (would write to output drive in Cartesi)
    output_json = json.dumps(trades)
    print("--- Computation Result ---")  # Use delimiters if needed
    print(output_json)
    print("--- End Computation Result ---")
    print("Offchain logic finished.", file=sys.stderr)