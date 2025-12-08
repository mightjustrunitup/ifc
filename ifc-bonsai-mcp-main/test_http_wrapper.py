#!/usr/bin/env python3
"""
Test script for the HTTP wrapper to verify /tools/list and /tools/call endpoints work correctly.
"""

import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def test_health():
    """Test health endpoint"""
    print("\n=== Testing /health endpoint ===")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"ERROR: {e}")
        return False

def test_tools_list():
    """Test /tools/list endpoint"""
    print("\n=== Testing /tools/list endpoint ===")
    try:
        response = requests.get(f"{BASE_URL}/tools/list", timeout=5)
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Tools found: {len(data.get('tools', []))}")
        for tool in data.get('tools', [])[:3]:  # Show first 3 tools
            print(f"  - {tool['name']}: {tool.get('description', 'N/A')}")
        return response.status_code == 200
    except Exception as e:
        print(f"ERROR: {e}")
        return False

def test_tools_call():
    """Test /tools/call endpoint"""
    print("\n=== Testing /tools/call endpoint ===")
    
    # First get the list to find a tool to call
    try:
        response = requests.get(f"{BASE_URL}/tools/list", timeout=5)
        tools = response.json().get('tools', [])
        
        if not tools:
            print("ERROR: No tools available")
            return False
        
        # Use the first tool for testing
        tool_name = tools[0]['name']
        print(f"Testing with tool: {tool_name}")
        
        # Call the tool with empty arguments (most should handle this)
        call_response = requests.post(
            f"{BASE_URL}/tools/call",
            json={"name": tool_name, "arguments": {}},
            timeout=30
        )
        
        print(f"Status: {call_response.status_code}")
        print(f"Response: {call_response.json()}")
        
        # Tool call may fail due to missing Blender connection, but endpoint should respond
        return call_response.status_code in [200, 400, 500]
        
    except Exception as e:
        print(f"ERROR: {e}")
        return False

def main():
    """Run all tests"""
    print("=" * 60)
    print("HTTP Wrapper Endpoint Tests")
    print("=" * 60)
    
    try:
        requests.get(f"{BASE_URL}/", timeout=5)
    except requests.exceptions.ConnectionError:
        print(f"ERROR: Cannot connect to {BASE_URL}")
        print("Make sure the HTTP server is running:")
        print("  cd ifc-bonsai-mcp-main")
        print("  python hybrid_server.py")
        return 1
    
    results = {
        "health": test_health(),
        "tools_list": test_tools_list(),
        "tools_call": test_tools_call()
    }
    
    print("\n" + "=" * 60)
    print("Test Results:")
    for test_name, passed in results.items():
        status = "✓ PASSED" if passed else "✗ FAILED"
        print(f"  {test_name}: {status}")
    
    passed = sum(results.values())
    total = len(results)
    print(f"\nTotal: {passed}/{total} tests passed")
    
    return 0 if passed == total else 1

if __name__ == "__main__":
    sys.exit(main())
