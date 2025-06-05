#!/usr/bin/env python3
"""
快速測試新改進的 match_orders 函數
"""

import sys
import os

# 添加當前目錄到路徑
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from offchain_logic import match_orders

def quick_test():
    """快速測試 match_orders 函數"""
    print("🚀 快速測試新的 match_orders 函數...")
    
    # 測試 1: 基本匹配
    print("\n=== 測試 1: 基本匹配 ===")
    orders = [
        {"id": 1, "user": "0x1234567890123456789012345678901234567890", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 10, "isBuyOrder": True, "filled": 0},
        {"id": 2, "user": "0x2345678901234567890123456789012345678901", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 50, "price": 9, "isBuyOrder": False, "filled": 0}
    ]
    
    trades = match_orders(orders)
    print(f"交易數量: {len(trades)}")
    if trades:
        print(f"交易詳情: {trades[0]}")
    
    # 測試 2: 多種 token
    print("\n=== 測試 2: 多種 Token ===")
    orders = [
        {"id": 1, "user": "0x1111111111111111111111111111111111111111", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 10, "isBuyOrder": True, "filled": 0},
        {"id": 2, "user": "0x2222222222222222222222222222222222222222", "token": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "amount": 50, "price": 5, "isBuyOrder": True, "filled": 0},
        {"id": 3, "user": "0x3333333333333333333333333333333333333333", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 80, "price": 9, "isBuyOrder": False, "filled": 0},
        {"id": 4, "user": "0x4444444444444444444444444444444444444444", "token": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "amount": 30, "price": 4, "isBuyOrder": False, "filled": 0}
    ]
    
    trades = match_orders(orders)
    print(f"交易數量: {len(trades)}")
    for i, trade in enumerate(trades):
        print(f"交易 {i+1}: Buy#{trade[0]} x Sell#{trade[1]}, Token: {trade[4][:10]}..., Price: {trade[5]}, Quantity: {trade[6]}")
    
    # 測試 3: 價格不交叉
    print("\n=== 測試 3: 價格不交叉 ===")
    orders = [
        {"id": 1, "user": "0x1111111111111111111111111111111111111111", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 100, "price": 8, "isBuyOrder": True, "filled": 0},
        {"id": 2, "user": "0x2222222222222222222222222222222222222222", "token": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 50, "price": 10, "isBuyOrder": False, "filled": 0}
    ]
    
    trades = match_orders(orders)
    print(f"交易數量: {len(trades)} (應該是 0)")
    
    print("\n✅ 快速測試完成！")

if __name__ == "__main__":
    quick_test()
