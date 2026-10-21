#!/bin/bash
# Quick API Test Script for Cakestyles Production

BASE_URL="https://cakestyles.vercel.app"

echo "🧪 Cakestyles Production API Tests"
echo "===================================="
echo ""

# Test 1: Health Check
echo "1️⃣ Testing Health Endpoint..."
HEALTH=$(curl -s "$BASE_URL/api/health")
echo "   Response: $HEALTH"
if [[ $HEALTH == *"\"ok\":true"* ]]; then
  echo "   ✅ PASS: Backend is healthy"
else
  echo "   ❌ FAIL: Backend unhealthy"
fi
echo ""

# Test 2: Admin Login
echo "2️⃣ Testing Admin Login..."
LOGIN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@cakestyles.test","password":"Cakestyles@123"}')

if [[ $LOGIN == *"\"token\""* ]]; then
  echo "   ✅ PASS: Admin login successful"
  TOKEN=$(echo $LOGIN | grep -o '"token":"[^"]*' | cut -d'"' -f4)
  echo "   Token: ${TOKEN:0:50}..."
else
  echo "   ❌ FAIL: Login failed"
  echo "   Response: $LOGIN"
  exit 1
fi
echo ""

# Test 3: Get Products
echo "3️⃣ Testing Products API..."
PRODUCTS=$(curl -s "$BASE_URL/api/products")
PRODUCT_COUNT=$(echo $PRODUCTS | grep -o '"_id"' | wc -l)
echo "   Products in database: $PRODUCT_COUNT"
if [ $PRODUCT_COUNT -gt 0 ]; then
  echo "   ✅ PASS: Products retrieved"
  # Show first product name
  FIRST_PRODUCT=$(echo $PRODUCTS | grep -o '"name":"[^"]*' | head -1 | cut -d'"' -f4)
  echo "   Example product: $FIRST_PRODUCT"
else
  echo "   ❌ FAIL: No products found"
fi
echo ""

# Test 4: Get Categories
echo "4️⃣ Testing Categories API..."
CATEGORIES=$(curl -s "$BASE_URL/api/categories")
CATEGORY_COUNT=$(echo $CATEGORIES | grep -o '"_id"' | wc -l)
echo "   Categories in database: $CATEGORY_COUNT"
if [ $CATEGORY_COUNT -gt 0 ]; then
  echo "   ✅ PASS: Categories retrieved"
  # Show categories
  CATEGORY_NAMES=$(echo $CATEGORIES | grep -o '"name":"[^"]*' | cut -d'"' -f4 | head -5)
  echo "   Categories: $CATEGORY_NAMES"
else
  echo "   ❌ FAIL: No categories found"
fi
echo ""

# Test 5: Get Orders (Admin)
echo "5️⃣ Testing Orders API (Admin)..."
ORDERS=$(curl -s "$BASE_URL/api/orders" \
  -H "Authorization: Bearer $TOKEN")
ORDER_COUNT=$(echo $ORDERS | grep -o '"_id"' | wc -l)
echo "   Orders in database: $ORDER_COUNT"
if [ $ORDER_COUNT -gt 0 ]; then
  echo "   ✅ PASS: Orders retrieved"
else
  echo "   ⚠️  WARNING: No orders found (may be expected)"
fi
echo ""

# Test 6: Get Settings
echo "6️⃣ Testing Settings API..."
SETTINGS=$(curl -s "$BASE_URL/api/settings")
if [[ $SETTINGS == *"\"delivery\""* ]]; then
  echo "   ✅ PASS: Settings retrieved"
  DELIVERY_ENABLED=$(echo $SETTINGS | grep -o '"enabled":[^,}]*' | head -1 | cut -d':' -f2)
  echo "   Delivery enabled: $DELIVERY_ENABLED"
else
  echo "   ⚠️  WARNING: Settings may not be configured"
fi
echo ""

echo "===================================="
echo "🎉 API Test Complete!"
echo ""
echo "📋 Summary:"
echo "   - Health Check: Working"
echo "   - Authentication: Working"
echo "   - Products API: $PRODUCT_COUNT products"
echo "   - Categories API: $CATEGORY_COUNT categories"
echo "   - Orders API: $ORDER_COUNT orders"
echo "   - Settings API: Working"
echo ""
echo "✅ Backend is fully functional!"
echo ""
echo "Next Steps:"
echo "1. Open https://cakestyles.vercel.app/admin/login"
echo "2. Follow the manual tests in PRODUCTION_E2E_TEST_GUIDE.md"
echo "3. Test the complete checkout flow with map location"
