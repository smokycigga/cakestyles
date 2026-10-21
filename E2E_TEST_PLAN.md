# Cakestyles End-to-End Test Plan

## Prerequisites
- MongoDB Atlas cluster must be running and accessible
- Both `.env` files configured (root and `server/.env`)
- `client/.env.local` with Google Maps API key (for delivery map testing)

## Test Setup

### 1. Start Backend
```bash
cd server
npm start
```
Expected: `🧁 Cakestyles server running on port 5000`

### 2. Start Frontend
```bash
cd client
npm run dev
```
Expected: Frontend running at `http://localhost:5173`

---

## Test Suite

### TEST 1: Backend Health Check ✓
**Purpose**: Verify backend is running and accessible

```bash
curl http://localhost:5000/api/health
```
**Expected Response**: `{"status":"ok"}`

---

### TEST 2: Admin Login ✓
**Purpose**: Verify authentication system works

**Steps**:
1. Navigate to: `http://localhost:5173/admin/login`
2. Enter credentials:
   - Email: `owner@cakestyles.test`
   - Password: `Cakestyles@123`
3. Click "Sign in"

**Expected**: Redirect to admin dashboard with JWT token stored

**API Test**:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@cakestyles.test","password":"Cakestyles@123"}'
```
**Expected Response**: `{"token":"jwt_token_here","user":{...}}`

---

### TEST 3: Create Product in Admin ✓
**Purpose**: Test admin product creation and database sync

**Steps**:
1. Go to: `http://localhost:5173/admin/products`
2. Click "Add Product" or "New Product"
3. Fill in product details:
   - Name: `E2E Test Cake`
   - Category: `Cakes`
   - Price: `599`
   - Description: `This is a test product for end-to-end testing`
   - Available: `Yes`
   - Tags: `test, e2e`
4. Upload an image (optional)
5. Click "Save" or "Create Product"

**Expected**: 
- Success message shown
- Product appears in the products list
- Product saved to MongoDB

---

### TEST 4: Verify Product on Frontend ✓
**Purpose**: Confirm admin-backend-frontend sync works

**Steps**:
1. Navigate to: `http://localhost:5173/menu`
2. Look for "E2E Test Cake" in the product grid
3. Click on the product card
4. Verify product detail page shows:
   - Name: E2E Test Cake
   - Price: ₹599
   - Description matches

**Expected**: Product created in admin is immediately visible on public menu

**API Test**:
```bash
curl http://localhost:5000/api/products
```
**Expected**: JSON array containing the E2E Test Cake product

---

### TEST 5: Edit Product in Admin ✓
**Purpose**: Test product updates sync to frontend

**Steps**:
1. Go to: `http://localhost:5173/admin/products`
2. Find "E2E Test Cake"
3. Click "Edit" or the edit icon
4. Change:
   - Name: `E2E Test Cake (Updated)`
   - Price: `699`
   - Description: `Updated description for testing`
5. Click "Save Changes"

**Expected**: Product updates saved successfully

---

### TEST 6: Verify Edit on Frontend ✓
**Purpose**: Confirm edits sync to frontend

**Steps**:
1. Go to: `http://localhost:5173/menu`
2. Find the product (should now show as "E2E Test Cake (Updated)")
3. Verify price shows ₹699
4. Open product detail page
5. Verify description shows updated text

**Expected**: All changes from admin appear on frontend immediately after page refresh

---

### TEST 7: Add Product to Cart (Frontend) ✓
**Purpose**: Test shopping cart functionality

**Steps**:
1. On `http://localhost:5173/menu`
2. Find any product
3. Click "Add to Cart" or similar button
4. Verify cart badge/counter increments
5. Click cart icon
6. Verify product appears in cart with correct:
   - Name
   - Price
   - Quantity
   - Subtotal

**Expected**: Cart state persists, shows correct items and calculations

---

### TEST 8: Checkout Flow - Store Pickup ✓
**Purpose**: Test complete order creation without payment

**Steps**:
1. With items in cart, go to: `http://localhost:5173/cart`
2. Click "Checkout" or "Proceed to Checkout"
3. **Fulfilment**: Select "Store Pickup"
4. **Date/Time**: Choose a pickup slot
5. **Contact**: Fill in:
   - Name: `Test Customer`
   - Email: `test@example.com`
   - Phone: `9876543210`
6. **Special instructions** (optional): `E2E test order - pickup`
7. Click "Place Order" (skip payment for now)

**Expected**: 
- Order created successfully
- Order confirmation page shows
- Order ID displayed
- "Payment Pending" status shown

---

### TEST 9: Verify Order in Backend ✓
**Purpose**: Confirm order appears in admin panel

**Steps**:
1. Go to: `http://localhost:5173/admin/orders`
2. Look for the test order (should be at the top)
3. Click on the order to view details
4. Verify order contains:
   - Customer: Test Customer
   - Email: test@example.com
   - Phone: 9876543210
   - Items: E2E Test Cake (or products you added)
   - Fulfilment: Pickup
   - Status: Pending Payment (or similar)
   - Special instructions: E2E test order - pickup

**Expected**: Order data matches exactly what was entered in checkout

**API Test**:
```bash
# First get auth token
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@cakestyles.test","password":"Cakestyles@123"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# Then fetch orders
curl http://localhost:5000/api/orders \
  -H "Authorization: Bearer $TOKEN"
```
**Expected**: JSON array with the test order

---

### TEST 10: Checkout Flow - Delivery with Map ✓
**Purpose**: Test delivery flow with map location picker

**Steps**:
1. Clear cart or add new items
2. Go to checkout
3. **Fulfilment**: Select "Delivery"
4. **Location Permission**: 
   - Click "Use my current location" button
   - Browser will show: "localhost is asking to Know your location"
   - Click "Allow"
5. **Map Selection**:
   - Map should center on your location
   - Drag the red marker to adjust delivery location
   - OR click anywhere on the map to set delivery point
6. Verify:
   - Address fields auto-populate from reverse geocoding
   - Distance from store is calculated and shown (e.g., "5.2 km away")
   - Delivery fee calculated (₹18 per km, rounded up)
7. Fill in remaining address details:
   - Address line
   - City
   - Pincode
8. Fill contact details
9. Click "Place Order"

**Expected**: 
- Location permission prompt appears (like in your screenshot)
- Map loads with marker
- Coordinates captured (latitude/longitude)
- Distance calculated
- Delivery fee computed: `Math.ceil(distanceKm) * 18`
- Order created with delivery address including coordinates

---

### TEST 11: Verify Delivery Order in Backend ✓
**Purpose**: Confirm delivery pricing is calculated server-side

**Steps**:
1. Go to: `http://localhost:5173/admin/orders`
2. Find the delivery order
3. Click to view details
4. Verify order contains:
   - Fulfilment: Delivery
   - Address with all fields including:
     - latitude
     - longitude
     - distanceKm
   - Delivery fee matches server calculation
   - Total = Subtotal + Delivery Fee

**Expected**: 
- Server recalculated delivery fee independently (security)
- Coordinates stored in database
- Distance matches client calculation

---

### TEST 12: Settings Sync Test ✓
**Purpose**: Verify settings changes affect frontend

**Steps**:
1. Go to: `http://localhost:5173/admin` (settings or dashboard)
2. Find delivery settings (if available)
3. Try toggling "Delivery enabled" off
4. Go to public site, try to checkout
5. Verify delivery option is disabled/hidden
6. Go back to admin, re-enable delivery
7. Verify delivery option reappears

**Expected**: Settings changes immediately affect frontend behavior

---

### TEST 13: Order Status Update ✓
**Purpose**: Test admin order management

**Steps**:
1. In admin orders list, select a test order
2. Update order status (e.g., Pending → Confirmed → Preparing → Ready)
3. Save changes
4. Refresh the page
5. Verify status persists

**Optional - Track Order Flow**:
1. Copy the order ID
2. Go to: `http://localhost:5173/track`
3. Enter order ID
4. Verify order status shows correctly

**Expected**: Status updates persist and are visible on track page

---

### TEST 14: Product Delete Sync ✓
**Purpose**: Verify product deletion syncs to frontend

**Steps**:
1. In admin products, find "E2E Test Cake (Updated)"
2. Click "Delete" or trash icon
3. Confirm deletion
4. Go to frontend menu
5. Verify product no longer appears

**Expected**: Deleted products immediately disappear from frontend

---

## Test Results Summary

| Test | Status | Notes |
|------|--------|-------|
| Backend Health | ⏸️ | MongoDB connection refused - needs fixing |
| Admin Login | ⏳ | Pending backend fix |
| Create Product | ⏳ | Pending backend fix |
| Product on Frontend | ⏳ | Pending backend fix |
| Edit Product | ⏳ | Pending backend fix |
| Edit on Frontend | ⏳ | Pending backend fix |
| Add to Cart | ⏳ | Can test with existing products |
| Checkout - Pickup | ⏳ | Pending backend fix |
| Order in Backend | ⏳ | Pending backend fix |
| Checkout - Delivery + Map | ⏳ | Needs Google Maps API key + backend |
| Delivery Order in Backend | ⏳ | Pending backend fix |
| Settings Sync | ⏳ | Pending backend fix |
| Order Status Update | ⏳ | Pending backend fix |
| Product Delete Sync | ⏳ | Pending backend fix |

---

## Current Blocker

**MongoDB Connection Issue**:
```
Error: querySrv ECONNREFUSED _mongodb._tcp.cluster0.smaitrp.mongodb.net
```

**Possible Causes**:
1. MongoDB Atlas cluster is paused (free tier pauses after inactivity)
2. Network connectivity issue
3. IP whitelist restriction (Atlas allows only specific IPs)
4. Incorrect connection string

**Solutions**:
1. **Check Atlas Dashboard**: 
   - Go to https://cloud.mongodb.com
   - Verify cluster is running (not paused)
   - Click "Resume" if paused
   
2. **Check IP Whitelist**:
   - In Atlas → Network Access
   - Add current IP: `0.0.0.0/0` (allow from anywhere) for testing
   
3. **Test Connection String**:
   - Verify `MONGO_URI` in `server/.env` is correct
   - Format should be: `mongodb+srv://username:password@cluster0.smaitrp.mongodb.net/dbname`

4. **Restart Server** after fixes:
   ```bash
   cd server
   npm start
   ```

---

## Next Steps

1. **Fix MongoDB Connection** - This is the blocker for all backend tests
2. **Add Google Maps API Key** to `client/.env.local`:
   ```
   VITE_GOOGLE_MAPS_API_KEY=your_key_here
   ```
3. **Run All Tests** in order once backend is working
4. **Document Results** - Update the test results table
5. **Test with Razorpay** - Once basic flow works, integrate payment

---

## Quick Start Commands

```bash
# Terminal 1 - Backend
cd server
npm start

# Terminal 2 - Frontend  
cd client
npm run dev

# Terminal 3 - API Tests
# Use curl commands from individual tests above
```

---

## Production Testing

Once local tests pass, repeat key tests on production:
- URL: https://cakestyles.vercel.app
- Admin: https://cakestyles.vercel.app/admin/login

**Note**: Production uses the same MongoDB database, so products/orders created locally will appear in production and vice versa.
