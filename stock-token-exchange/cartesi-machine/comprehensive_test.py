#!/usr/bin/env python3
"""
完整的 Cartesi 股票交易所測試套件
包含單元測試和 ABI 編碼測試（含 subprocess 調用）
"""

import subprocess
import json
import sys
import os
from eth_abi import encode as encode_abi
from eth_abi import decode as decode_abi

# 添加當前目錄到路徑以導入 offchain_logic
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from offchain_logic import match_orders, handle_order_request, CARTESI_ORDER_INPUT_TYPE_STR, INPUT_PAYLOAD_DECODE_TYPES

# 脫機邏輯腳本路徑
OFFCHAIN_LOGIC_SCRIPT = os.path.join(os.path.dirname(__file__), "offchain_logic.py")

# 定義 MatchedTrade 結構用於解碼輸出
MATCHED_TRADE_TYPES = ['(uint256,uint256,address,address,address,uint256,uint256)[]']

def normalize_address(addr):
    """規範化地址格式，確保一致的比較"""
    if isinstance(addr, bytes):
        addr = addr.hex()
    if addr.startswith('0x'):
        addr = addr[2:]
    
    # 將地址轉換為大寫並確保正確的長度
    addr = addr.upper()
    
    # 如果地址超過40字符，取最後40個字符（去掉前導零）
    if len(addr) > 40:
        addr = addr[-40:]
    # 如果地址少於40字符，在左邊填充零
    elif len(addr) < 40:
        addr = addr.rjust(40, '0')
        
    return '0x' + addr

def run_offchain_logic(input_payload_hex):
    """
    使用給定的 ABI 編碼輸入負載（十六進制字符串）運行 offchain_logic.py 腳本
    返回腳本的結果字典
    """
    try:
        cmd = ['python3', OFFCHAIN_LOGIC_SCRIPT, input_payload_hex]
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
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
        
        # 解析輸出中的 JSON 結果
        lines = stdout_text.strip().split('\n')
        json_line = None
        for line in reversed(lines):
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
    """
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
        # 將 hex 地址轉換為 bytes 以便 ABI 編碼 (確保 20 bytes)
        user_hex = order["user"][2:] if order["user"].startswith("0x") else order["user"]
        token_hex = order["token"][2:] if order["token"].startswith("0x") else order["token"]
        
        # 補充到 40 個字符 (20 bytes)
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
    
    # ABI 編碼數據
    encoded = encode_abi(INPUT_PAYLOAD_DECODE_TYPES, [buy_tuples, sell_tuples])
    return "0x" + encoded.hex()

def decode_trade_results(result_payload_hex):
    """
    解碼 ABI 編碼的交易結果
    """
    if result_payload_hex.startswith("0x"):
        payload_bytes = bytes.fromhex(result_payload_hex[2:])
    else:
        payload_bytes = bytes.fromhex(result_payload_hex)
    
    # 解碼 ABI 編碼的交易結果
    decoded = decode_abi(MATCHED_TRADE_TYPES, payload_bytes)
    return decoded[0]  # 返回交易元組數組

# === 單元測試函數 ===

def test_basic_matching():
    """測試基本的單一 token 買賣匹配"""
    print("\n=== 測試基本匹配 ===")
    orders = [
        {"id": 1, "user": "0x1234567890123456789012345678901234567890", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 10, "isBuyOrder": True, "filled": 0},
        {"id": 2, "user": "0x2345678901234567890123456789012345678901", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 50, "price": 9, "isBuyOrder": False, "filled": 0}
    ]
    
    trades = match_orders(orders)
    
    print(f"預期交易數量: 1, 實際: {len(trades)}")
    assert len(trades) == 1, f"應該有 1 筆交易，但得到 {len(trades)} 筆"
    
    trade = trades[0]
    print(f"交易詳情: {trade}")
    assert trade[0] == 1, f"買單 ID 應該是 1，但是 {trade[0]}"
    assert trade[1] == 2, f"賣單 ID 應該是 2，但是 {trade[1]}"
    assert trade[5] == 10, f"交易價格應該是 10，但是 {trade[5]}"
    assert trade[6] == 50, f"交易數量應該是 50，但是 {trade[6]}"
    
    print("✅ 基本匹配測試通過")

def test_multiple_tokens():
    """測試多種 token 的匹配"""
    print("\n=== 測試多種 Token 匹配 ===")
    orders = [
        {"id": 1, "user": "0x1234567890123456789012345678901234567890", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 10, "isBuyOrder": True, "filled": 0},
        {"id": 2, "user": "0x2345678901234567890123456789012345678901", "token": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "amount": 50, "price": 5, "isBuyOrder": True, "filled": 0},
        {"id": 3, "user": "0x3456789012345678901234567890123456789012", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 80, "price": 9, "isBuyOrder": False, "filled": 0},        {"id": 4, "user": "0x4567890123456789012345678901234567890123", "token": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "amount": 30, "price": 4, "isBuyOrder": False, "filled": 0}
    ]
    
    trades = match_orders(orders)
    
    print(f"預期交易數量: 2, 實際: {len(trades)}")
    assert len(trades) == 2, f"應該有 2 筆交易，但得到 {len(trades)} 筆"
    
    # 檢查兩筆交易是否涵蓋了兩種不同的 token
    tokens_traded = set(normalize_address(trade[4]) for trade in trades)
    expected_tokens = {"0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}
    assert tokens_traded == expected_tokens, f"應該交易兩種 token，但只有 {tokens_traded}"
    
    print("✅ 多種 Token 匹配測試通過")

def test_no_crossing_orders():
    """測試無法匹配的訂單（價格不交叉）"""
    print("\n=== 測試價格不交叉的情況 ===")
    orders = [
        {"id": 1, "user": "0x1234567890123456789012345678901234567890", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 8, "isBuyOrder": True, "filled": 0},
        {"id": 2, "user": "0x2345678901234567890123456789012345678901", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 50, "price": 10, "isBuyOrder": False, "filled": 0}
    ]
    
    trades = match_orders(orders)
    
    print(f"預期交易數量: 0, 實際: {len(trades)}")
    assert len(trades) == 0, f"買價低於賣價，不應有交易，但得到 {len(trades)} 筆交易"
    
    print("✅ 價格不交叉測試通過")

def run_unit_tests():
    """運行所有單元測試"""
    print("🚀 開始運行訂單匹配單元測試...")
    
    try:
        test_basic_matching()
        test_multiple_tokens()
        test_no_crossing_orders()
        
        print("\n🎉 所有單元測試都通過了！")
        return True
        
    except AssertionError as e:
        print(f"\n❌ 測試失敗: {e}")
        return False
    except Exception as e:
        print(f"\n💥 測試過程中發生錯誤: {e}")
        return False

# === ABI 編碼測試函數 ===

def test_abi_basic_matching():
    """測試 ABI 編碼的基本匹配"""
    print("\n=== ABI 測試：基本匹配 ===")
    
    buy_orders = [
        {"id": 1, "user": "0x1234567890123456789012345678901234567890", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 10}
    ]
    sell_orders = [
        {"id": 2, "user": "0x2345678901234567890123456789012345678901", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 50, "price": 9}
    ]
    
    # 編碼訂單
    input_payload_hex = encode_orders_for_cartesi(buy_orders, sell_orders)
    print(f"編碼的輸入負載: {input_payload_hex[:100]}...")
    
    # 運行腳本
    result = run_offchain_logic(input_payload_hex)
    assert result is not None, "應該返回結果"
    assert result["type"] == "notice", f"結果類型應該是 'notice'，但是 {result['type']}"
    
    # 解碼交易結果
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
    
    # 編碼訂單
    input_payload_hex = encode_orders_for_cartesi(buy_orders, sell_orders)
    print(f"編碼的輸入負載: {input_payload_hex[:100]}...")
      # 運行腳本
    result = run_offchain_logic(input_payload_hex)
    assert result is not None, "應該返回結果"
    assert result["type"] == "notice", f"結果類型應該是 'notice'，但是 {result['type']}"
    
    # 解碼交易結果
    trades = decode_trade_results(result["payload"])
    
    print(f"解碼的交易數量: {len(trades)}")
    assert len(trades) == 2, f"應該有 2 筆交易，但得到 {len(trades)} 筆"
    
    # 檢查兩筆交易是否涵蓋了兩種不同的 token
    tokens_traded = set(normalize_address(trade[4]) for trade in trades)
    expected_tokens = {"0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}
    assert tokens_traded == expected_tokens, f"應該交易兩種 token，但只有 {tokens_traded}"
    
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
    
    # 編碼訂單
    input_payload_hex = encode_orders_for_cartesi(buy_orders, sell_orders)
    print(f"編碼的輸入負載: {input_payload_hex[:100]}...")
    
    # 運行腳本
    result = run_offchain_logic(input_payload_hex)
    assert result is not None, "應該返回結果"
    assert result["type"] == "notice", f"結果類型應該是 'notice'，但是 {result['type']}"
    
    # 解碼交易結果
    trades = decode_trade_results(result["payload"])
    
    print(f"解碼的交易數量: {len(trades)}")
    assert len(trades) == 0, f"買價低於賣價，不應有交易，但得到 {len(trades)} 筆交易"
    
    print("✅ ABI 無匹配測試通過")

def test_abi_empty_orders():
    """測試 ABI 編碼的空訂單情況"""
    print("\n=== ABI 測試：空訂單情況 ===")
    
    buy_orders = []
    sell_orders = []
    
    # 編碼訂單
    input_payload_hex = encode_orders_for_cartesi(buy_orders, sell_orders)
    print(f"編碼的輸入負載: {input_payload_hex[:100]}...")
    
    # 運行腳本
    result = run_offchain_logic(input_payload_hex)
    assert result is not None, "應該返回結果"
    assert result["type"] == "notice", f"結果類型應該是 'notice'，但是 {result['type']}"
    
    # 解碼交易結果
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
    
    # 編碼訂單
    input_payload_hex = encode_orders_for_cartesi(buy_orders, sell_orders)
    print(f"編碼的輸入負載: {input_payload_hex[:100]}...")
    
    # 運行腳本
    result = run_offchain_logic(input_payload_hex)
    assert result is not None, "應該返回結果"
    assert result["type"] == "notice", f"結果類型應該是 'notice'，但是 {result['type']}"
    
    # 解碼交易結果
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

def run_abi_tests():
    """運行所有 ABI 編碼測試"""
    print("🚀 開始運行 ABI 編碼測試（含 subprocess 調用）...")
    
    try:
        test_abi_basic_matching()
        test_abi_multiple_tokens()
        test_abi_no_matches()
        test_abi_empty_orders()
        test_abi_complex_scenario()
        
        print("\n🎉 所有 ABI 編碼測試都通過了！")
        return True
        
    except AssertionError as e:
        print(f"\n❌ ABI 測試失敗: {e}")
        return False
    except Exception as e:
        print(f"\n💥 ABI 測試過程中發生錯誤: {e}")
        return False

if __name__ == "__main__":
    print("🎯 Cartesi 股票交易所完整測試套件")
    print("=" * 60)
    print("選擇測試模式:")
    print("1. 運行單元測試（直接函數測試）")
    print("2. 運行 ABI 編碼測試（含 subprocess 調用）") 
    print("3. 運行所有測試")
    print("=" * 60)
    
    choice = input("請輸入選項 (1/2/3，預設為 3): ").strip()
    if not choice:
        choice = "3"
    
    success = True
    
    if choice == "1" or choice == "3":
        print("\n" + "="*60)
        print("🔧 運行單元測試...")
        print("="*60)
        if not run_unit_tests():
            success = False
            print("\n❌ 單元測試失敗")
        else:
            print("\n✅ 單元測試完成")
    
    if choice == "2" or choice == "3":
        print("\n" + "="*60)
        print("🚀 運行 ABI 編碼測試...")
        print("="*60)
        if not run_abi_tests():
            success = False
            print("\n❌ ABI 編碼測試失敗")
        else:
            print("\n✅ ABI 編碼測試完成")
    
    if success:
        print("\n" + "="*60)
        print("🎊 所有選定的測試都成功完成！")
        print("="*60)
        print("\n📋 測試摘要:")
        if choice == "1":
            print("✅ 單元測試：基本匹配、多 token、價格不交叉")
        elif choice == "2":
            print("✅ ABI 編碼測試：基本匹配、多 token、無匹配、空訂單、複雜場景")
        else:
            print("✅ 單元測試：基本匹配、多 token、價格不交叉")
            print("✅ ABI 編碼測試：基本匹配、多 token、無匹配、空訂單、複雜場景")
        print("\n🎯 您的 Cartesi 股票交易所訂單匹配系統運行正常！")
    else:
        print("\n" + "="*60)
        print("💥 有測試失敗，請檢查上面的錯誤訊息")
        print("="*60)
        sys.exit(1)
