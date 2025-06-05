#!/usr/bin/env python3
"""
ABI 編碼測試（含 subprocess 調用）
測試完整的 Cartesi 工作流程：ABI 編碼 → subprocess → ABI 解碼
"""

import subprocess
import json
import sys
import os
from eth_abi import encode as encode_abi
from eth_abi import decode as decode_abi

# 常數定義
OFFCHAIN_LOGIC_SCRIPT = os.path.join(os.path.dirname(__file__), "offchain_logic.py")
INPUT_PAYLOAD_DECODE_TYPES = ["(uint256,address,address,uint256,uint256,bool)[]", "(uint256,address,address,uint256,uint256,bool)[]"]
MATCHED_TRADE_TYPES = ['(uint256,uint256,address,address,address,uint256,uint256)[]']

def run_offchain_logic(input_payload_hex):
    """運行 offchain_logic.py 並返回結果"""
    try:
        cmd = ['python3', OFFCHAIN_LOGIC_SCRIPT, input_payload_hex]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout_text, stderr_text = process.communicate()
        
        if process.returncode != 0:
            print(f"ERROR: {stderr_text}")
            return None
        
        # 找到 JSON 結果
        lines = stdout_text.strip().split('\n')
        for line in reversed(lines):
            line = line.strip()
            if line.startswith('{') and line.endswith('}'):
                return json.loads(line)
        return None
        
    except Exception as e:
        print(f"執行錯誤: {e}")
        return None

def encode_orders_for_cartesi(buy_orders, sell_orders):
    """將訂單 ABI 編碼"""
    buy_tuples = []
    for order in buy_orders:
        # 將 hex 地址轉換為 bytes 以便 ABI 編碼 (確保 20 bytes)
        user_hex = order["user"][2:] if order["user"].startswith("0x") else order["user"]
        token_hex = order["token"][2:] if order["token"].startswith("0x") else order["token"]
        
        # 補充到 40 個字符 (20 bytes)
        user_hex = user_hex.upper().rjust(40, '0')
        token_hex = token_hex.upper().rjust(40, '0')
        
        user_bytes = bytes.fromhex(user_hex)
        token_bytes = bytes.fromhex(token_hex)
        
        buy_tuples.append((order["id"], user_bytes, token_bytes, order["amount"], order["price"], True))
    
    sell_tuples = []
    for order in sell_orders:
        # 將 hex 地址轉換為 bytes 以便 ABI 編碼 (確保 20 bytes)
        user_hex = order["user"][2:] if order["user"].startswith("0x") else order["user"]
        token_hex = order["token"][2:] if order["token"].startswith("0x") else order["token"]
        
        # 補充到 40 個字符 (20 bytes)
        user_hex = user_hex.upper().rjust(40, '0')
        token_hex = token_hex.upper().rjust(40, '0')
        
        user_bytes = bytes.fromhex(user_hex)
        token_bytes = bytes.fromhex(token_hex)
        
        sell_tuples.append((order["id"], user_bytes, token_bytes, order["amount"], order["price"], False))
    
    encoded = encode_abi(INPUT_PAYLOAD_DECODE_TYPES, [buy_tuples, sell_tuples])
    return "0x" + encoded.hex()

def decode_trade_results(result_payload_hex):
    """解碼交易結果"""
    if result_payload_hex.startswith("0x"):
        payload_bytes = bytes.fromhex(result_payload_hex[2:])
    else:
        payload_bytes = bytes.fromhex(result_payload_hex)
    
    decoded = decode_abi(MATCHED_TRADE_TYPES, payload_bytes)
    return decoded[0]

def test_abi_basic():
    """測試基本 ABI 工作流程"""
    print("\n=== ABI 測試：基本匹配 ===")
    
    buy_orders = [{"id": 1, "user": "0x1234567890123456789012345678901234567890", 
                   "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 10}]
    sell_orders = [{"id": 2, "user": "0x2345678901234567890123456789012345678901", 
                    "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 50, "price": 9}]
    
    # 1. ABI 編碼
    input_hex = encode_orders_for_cartesi(buy_orders, sell_orders)
    print(f"✅ ABI 編碼成功: {len(input_hex)} 字符")
    
    # 2. Subprocess 調用
    result = run_offchain_logic(input_hex)
    assert result is not None, "subprocess 應該返回結果"
    assert result["type"] == "notice", f"應該是 notice，但是 {result['type']}"
    print("✅ Subprocess 調用成功")
    
    # 3. ABI 解碼
    trades = decode_trade_results(result["payload"])
    print(f"✅ ABI 解碼成功: {len(trades)} 筆交易")
    
    # 4. 驗證結果
    assert len(trades) == 1, f"應該有 1 筆交易，但有 {len(trades)} 筆"
    trade = trades[0]
    assert trade[0] == 1 and trade[1] == 2, "交易 ID 不符"
    assert trade[6] == 50, f"交易數量應該是 50，但是 {trade[6]}"
    
    print("✅ 基本 ABI 測試通過！")

def test_abi_multiple_tokens():
    """測試多 token ABI 工作流程"""
    print("\n=== ABI 測試：多種 Token ===")
    
    buy_orders = [
        {"id": 1, "user": "0x1111111111111111111111111111111111111111", 
         "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 10},
        {"id": 2, "user": "0x2222222222222222222222222222222222222222", 
         "token": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "amount": 50, "price": 5}
    ]
    sell_orders = [
        {"id": 3, "user": "0x3333333333333333333333333333333333333333", 
         "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 80, "price": 9},
        {"id": 4, "user": "0x4444444444444444444444444444444444444444", 
         "token": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "amount": 30, "price": 4}
    ]
    
    input_hex = encode_orders_for_cartesi(buy_orders, sell_orders)
    result = run_offchain_logic(input_hex)
    trades = decode_trade_results(result["payload"])
    
    assert len(trades) == 2, f"應該有 2 筆交易，但有 {len(trades)} 筆"
    
    # 檢查不同 token
    tokens = set(trade[4] for trade in trades)
    assert len(tokens) == 2, f"應該有 2 種 token，但有 {len(tokens)} 種"
    
    print("✅ 多 token ABI 測試通過！")

def test_abi_no_match():
    """測試無匹配 ABI 工作流程"""
    print("\n=== ABI 測試：無匹配 ===")
    
    buy_orders = [{"id": 1, "user": "0x1234567890123456789012345678901234567890", 
                   "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 8}]
    sell_orders = [{"id": 2, "user": "0x2345678901234567890123456789012345678901", 
                    "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 50, "price": 10}]
    
    input_hex = encode_orders_for_cartesi(buy_orders, sell_orders)
    result = run_offchain_logic(input_hex)
    trades = decode_trade_results(result["payload"])
    
    assert len(trades) == 0, f"應該沒有交易，但有 {len(trades)} 筆"
    
    print("✅ 無匹配 ABI 測試通過！")

if __name__ == "__main__":
    print("🚀 開始 ABI 編碼測試（含 subprocess 調用）...")
    print("=" * 50)
    
    try:
        test_abi_basic()
        test_abi_multiple_tokens()
        test_abi_no_match()
        
        print("\n" + "=" * 50)
        print("🎉 所有 ABI 編碼測試都通過了！")
        print("=" * 50)
        print("\n📋 測試摘要:")
        print("✅ 基本匹配：ABI 編碼 → subprocess → ABI 解碼")
        print("✅ 多 token：跨多種代幣的匹配測試")
        print("✅ 無匹配：價格不交叉的情況測試")
        print("\n🎯 完整的 Cartesi 工作流程測試成功！")
        
    except Exception as e:
        print(f"\n❌ ABI 測試失敗: {e}")
        sys.exit(1)
