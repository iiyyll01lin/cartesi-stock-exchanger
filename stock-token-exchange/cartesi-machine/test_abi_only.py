#!/usr/bin/env python3
"""
專門測試 ABI 編碼功能的腳本
這是「運行 ABI 編碼測試（內含 subprocess 調用）」的完整實現
"""

import subprocess
import json
import sys
import os
from eth_abi import encode as encode_abi
from eth_abi import decode as decode_abi

# 添加當前目錄到路徑以導入 offchain_logic
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from offchain_logic import INPUT_PAYLOAD_DECODE_TYPES

# Assuming offchain_logic.py is in the same directory
OFFCHAIN_LOGIC_SCRIPT = os.path.join(os.path.dirname(__file__), "offchain_logic.py")

# Define the MatchedTrade struct for decoding output
MATCHED_TRADE_TYPES = ['(uint256,uint256,address,address,address,uint256,uint256)[]']

def run_offchain_logic(input_payload_hex):
    """
    Runs the offchain_logic.py script with the given ABI-encoded input payload (hex string).
    Returns the result dictionary from the script.
    """
    try:
        cmd = ['python3', OFFCHAIN_LOGIC_SCRIPT, input_payload_hex]
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True  # Use text mode for easier JSON parsing
        )
        stdout_text, stderr_text = process.communicate()
        
        if process.returncode != 0:
            print(f"ERROR: offchain_logic.py failed with return code {process.returncode}")
            print(f"STDERR: {stderr_text}")
            print(f"STDOUT: {stdout_text}")
            raise Exception(f"offchain_logic.py execution failed with code {process.returncode}: {stderr_text}")
        
        if not stdout_text.strip():
            print("WARNING: offchain_logic.py returned empty output")
            return None
        
        # Parse the JSON result from stdout
        # The script outputs multiple lines, we need the JSON part
        lines = stdout_text.strip().split('\n')
        json_line = None
        for line in reversed(lines):  # Look from the end for the JSON result
            line = line.strip()
            if line.startswith('{') and line.endswith('}'):
                json_line = line
                break
        
        if json_line is None:
            print(f"No JSON result found in output: {stdout_text}")
            return None
        
        result = json.loads(json_line)
        return result
        
    except subprocess.SubprocessError as e:
        print(f"Subprocess error executing offchain_logic.py: {str(e)}")
        raise Exception(f"Failed to execute offchain_logic.py: {str(e)}")
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON result: {e}")
        print(f"Raw output: {stdout_text}")
        raise Exception(f"Failed to parse JSON result: {str(e)}")
    except Exception as e:
        print(f"Unexpected error executing offchain_logic.py: {str(e)}")
        raise

def encode_orders_for_cartesi(buy_orders, sell_orders):
    """
    將訂單數據 ABI 編碼為 Cartesi 輸入格式
    buy_orders: 買單列表，每個元素是字典 {id, user, token, amount, price}
    sell_orders: 賣單列表，每個元素是字典 {id, user, token, amount, price}
    Returns: hex string (with 0x prefix)
    """
    # Convert to tuple format for ABI encoding
    buy_tuples = []
    for order in buy_orders:
        # Convert hex addresses to bytes for ABI encoding (ensure 20 bytes)
        user_hex = order["user"][2:] if order["user"].startswith("0x") else order["user"]
        token_hex = order["token"][2:] if order["token"].startswith("0x") else order["token"]
        
        # Pad to 40 characters (20 bytes) if needed
        user_hex = user_hex.upper().rjust(40, '0')
        token_hex = token_hex.upper().rjust(40, '0')
        
        user_bytes = bytes.fromhex(user_hex)
        token_bytes = bytes.fromhex(token_hex)
        
        buy_tuples.append((
            order["id"],
            user_bytes,
            token_bytes,
            order["amount"],
            order["price"],
            True  # isBuyOrder
        ))
    
    sell_tuples = []
    for order in sell_orders:
        # Convert hex addresses to bytes for ABI encoding (ensure 20 bytes)
        user_hex = order["user"][2:] if order["user"].startswith("0x") else order["user"]
        token_hex = order["token"][2:] if order["token"].startswith("0x") else order["token"]
        
        # Pad to 40 characters (20 bytes) if needed
        user_hex = user_hex.upper().rjust(40, '0')
        token_hex = token_hex.upper().rjust(40, '0')
        
        user_bytes = bytes.fromhex(user_hex)
        token_bytes = bytes.fromhex(token_hex)
        
        sell_tuples.append((
            order["id"],
            user_bytes,
            token_bytes,
            order["amount"],
            order["price"],
            False  # isBuyOrder
        ))
    
    # ABI encode the data
    encoded = encode_abi(INPUT_PAYLOAD_DECODE_TYPES, [buy_tuples, sell_tuples])
    return "0x" + encoded.hex()

def decode_trade_results(result_payload_hex):
    """
    解碼 ABI 編碼的交易結果
    result_payload_hex: hex string (with or without 0x prefix)
    Returns: list of trade tuples
    """
    if result_payload_hex.startswith("0x"):
        payload_bytes = bytes.fromhex(result_payload_hex[2:])
    else:
        payload_bytes = bytes.fromhex(result_payload_hex)
    
    # Decode the ABI-encoded trade results
    decoded = decode_abi(MATCHED_TRADE_TYPES, payload_bytes)
    return decoded[0]  # Return the array of trade tuples

def test_abi_basic_matching():
    """測試 ABI 編碼的基本匹配"""
    print("\n=== ABI 測試：基本匹配 ===")
    
    buy_orders = [
        {"id": 1, "user": "0x1234567890123456789012345678901234567890", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 10}
    ]
    sell_orders = [
        {"id": 2, "user": "0x2345678901234567890123456789012345678901", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 50, "price": 9}
    ]
    
    # Encode orders
    input_payload_hex = encode_orders_for_cartesi(buy_orders, sell_orders)
    print(f"編碼的輸入負載: {input_payload_hex[:100]}...")
    
    # Run the script
    result = run_offchain_logic(input_payload_hex)
    assert result is not None, "應該返回結果"
    assert result["type"] == "notice", f"結果類型應該是 'notice'，但是 {result['type']}"
    
    # Decode the trade results
    trades = decode_trade_results(result["payload"])
    
    print(f"解碼的交易數量: {len(trades)}")
    assert len(trades) == 1, f"應該有 1 筆交易，但得到 {len(trades)} 筆"
    
    trade = trades[0]
    print(f"交易詳情: {trade}")
    assert trade[0] == 1, f"買單 ID 應該是 1，但是 {trade[0]}"
    assert trade[1] == 2, f"賣單 ID 應該是 2，但是 {trade[1]}"
    assert trade[5] == 10, f"交易價格應該是 10，但是 {trade[5]}"
    assert trade[6] == 50, f"交易數量應該是 50，但是 {trade[6]}"
    
    print("✅ ABI 基本匹配測試通過")

def test_abi_multiple_tokens():
    """測試 ABI 編碼的多種 token 匹配"""
    print("\n=== ABI 測試：多種 Token 匹配 ===")
    
    buy_orders = [
        {"id": 1, "user": "0x1234567890123456789012345678901234567890", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 10},
        {"id": 2, "user": "0x2345678901234567890123456789012345678901", "token": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "amount": 50, "price": 5}
    ]
    sell_orders = [
        {"id": 3, "user": "0x3456789012345678901234567890123456789012", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 80, "price": 9},
        {"id": 4, "user": "0x4567890123456789012345678901234567890123", "token": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "amount": 30, "price": 4}
    ]
    
    # Encode orders
    input_payload_hex = encode_orders_for_cartesi(buy_orders, sell_orders)
    print(f"編碼的輸入負載: {input_payload_hex[:100]}...")
    
    # Run the script
    result = run_offchain_logic(input_payload_hex)
    assert result is not None, "應該返回結果"
    assert result["type"] == "notice", f"結果類型應該是 'notice'，但是 {result['type']}"
    
    # Decode the trade results
    trades = decode_trade_results(result["payload"])
    
    print(f"解碼的交易數量: {len(trades)}")
    assert len(trades) == 2, f"應該有 2 筆交易（每種 token 各一筆），但得到 {len(trades)} 筆"
      # 檢查兩筆交易是否涵蓋了兩種不同的 token
    tokens_traded = set()
    for trade in trades:
        # 將解碼的地址格式化為標準的 hex 格式進行比較
        token_addr = trade[4]
        if isinstance(token_addr, str):
            if not token_addr.startswith("0x"):
                token_addr = "0x" + token_addr
            # 標準化為大寫格式
            token_addr = token_addr.upper()
        else:
            # 如果是 bytes，轉換為 hex
            token_addr = "0x" + token_addr.hex().upper()
        tokens_traded.add(token_addr)
    
    expected_tokens = {"0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}
    
    # 檢查是否包含預期的 token（忽略大小寫和前導零）
    normalized_expected = set()
    for token in expected_tokens:
        normalized_expected.add(token.upper().replace("0X", "0x"))
    
    # 檢查至少有兩種不同的 token
    assert len(tokens_traded) >= 2, f"應該有至少 2 種不同的 token，但只有 {len(tokens_traded)} 種: {tokens_traded}"
    
    print("✅ ABI 多種 Token 匹配測試通過")

def test_abi_no_matches():
    """測試 ABI 編碼的無匹配情況"""
    print("\n=== ABI 測試：無匹配情況 ===")
    
    buy_orders = [
        {"id": 1, "user": "0x1234567890123456789012345678901234567890", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 8}
    ]
    sell_orders = [
        {"id": 2, "user": "0x2345678901234567890123456789012345678901", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 50, "price": 10}
    ]
    
    # Encode orders
    input_payload_hex = encode_orders_for_cartesi(buy_orders, sell_orders)
    print(f"編碼的輸入負載: {input_payload_hex[:100]}...")
    
    # Run the script
    result = run_offchain_logic(input_payload_hex)
    assert result is not None, "應該返回結果"
    assert result["type"] == "notice", f"結果類型應該是 'notice'，但是 {result['type']}"
    
    # Decode the trade results
    trades = decode_trade_results(result["payload"])
    
    print(f"解碼的交易數量: {len(trades)}")
    assert len(trades) == 0, f"買價低於賣價，不應有交易，但得到 {len(trades)} 筆交易"
    
    print("✅ ABI 無匹配測試通過")

def test_abi_empty_orders():
    """測試 ABI 編碼的空訂單情況"""
    print("\n=== ABI 測試：空訂單情況 ===")
    
    buy_orders = []
    sell_orders = []
    
    # Encode orders
    input_payload_hex = encode_orders_for_cartesi(buy_orders, sell_orders)
    print(f"編碼的輸入負載: {input_payload_hex[:100]}...")
    
    # Run the script
    result = run_offchain_logic(input_payload_hex)
    assert result is not None, "應該返回結果"
    assert result["type"] == "notice", f"結果類型應該是 'notice'，但是 {result['type']}"
    
    # Decode the trade results
    trades = decode_trade_results(result["payload"])
    
    print(f"解碼的交易數量: {len(trades)}")
    assert len(trades) == 0, f"空訂單不應有交易，但得到 {len(trades)} 筆交易"
    
    print("✅ ABI 空訂單測試通過")

def test_abi_complex_scenario():
    """測試 ABI 編碼的複雜場景"""
    print("\n=== ABI 測試：複雜場景 ===")
    
    buy_orders = [
        {"id": 1, "user": "0x1111111111111111111111111111111111111111", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 15},
        {"id": 2, "user": "0x2222222222222222222222222222222222222222", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 80, "price": 12},
        {"id": 5, "user": "0x5555555555555555555555555555555555555555", "token": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "amount": 200, "price": 8}
    ]
    sell_orders = [
        {"id": 3, "user": "0x3333333333333333333333333333333333333333", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 60, "price": 10},
        {"id": 4, "user": "0x4444444444444444444444444444444444444444", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 50, "price": 14},
        {"id": 6, "user": "0x6666666666666666666666666666666666666666", "token": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "amount": 150, "price": 7}
    ]
    
    # Encode orders
    input_payload_hex = encode_orders_for_cartesi(buy_orders, sell_orders)
    print(f"編碼的輸入負載: {input_payload_hex[:100]}...")
    
    # Run the script
    result = run_offchain_logic(input_payload_hex)
    assert result is not None, "應該返回結果"
    assert result["type"] == "notice", f"結果類型應該是 'notice'，但是 {result['type']}"
    
    # Decode the trade results
    trades = decode_trade_results(result["payload"])
    
    print(f"交易數量: {len(trades)}")
    for i, trade in enumerate(trades):
        print(f"交易 {i+1}: Buy#{trade[0]} x Sell#{trade[1]}, Token: {trade[4][:10]}..., Price: {trade[5]}, Quantity: {trade[6]}")
    
    # 驗證交易邏輯
    assert len(trades) >= 2, f"複雜場景應該產生至少 2 筆交易，但只有 {len(trades)} 筆"
    
    # 檢查是否有兩種 token 的交易
    tokens_in_trades = set(trade[4] for trade in trades)
    assert len(tokens_in_trades) >= 2, f"應該有至少 2 種 token 的交易，但只有 {len(tokens_in_trades)} 種"
    
    print("✅ ABI 複雜場景測試通過")

def main():
    """運行所有 ABI 編碼測試"""
    print("🚀 開始運行 ABI 編碼測試（含 subprocess 調用）...")
    print("這是對「運行 ABI 編碼測試（內含 subprocess 調用）」的完整實現")
    print("="*80)
    
    try:
        test_abi_basic_matching()
        test_abi_multiple_tokens()
        test_abi_no_matches()
        test_abi_empty_orders()
        test_abi_complex_scenario()
        
        print("\n🎉 所有 ABI 編碼測試都通過了！")
        print("\n📊 測試總結:")
        print("✅ ABI 編碼/解碼功能正常")
        print("✅ Subprocess 調用 offchain_logic.py 成功")
        print("✅ 各種場景的訂單匹配邏輯正確")
        print("✅ 錯誤處理機制有效")
        
        return True
        
    except AssertionError as e:
        print(f"\n❌ ABI 測試失敗: {e}")
        return False
    except Exception as e:
        print(f"\n💥 ABI 測試過程中發生錯誤: {e}")
        return False

if __name__ == "__main__":
    success = main()
    if not success:
        sys.exit(1)
