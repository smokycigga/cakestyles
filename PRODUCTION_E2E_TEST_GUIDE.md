# Cakestyles Production E2E Test Guide

## ✅ Production Backend Status
- **URL**: https://cakestyles.vercel.app
- **Backend**: ✅ Connected to MongoDB
- **Health Check**: ✅ OK
- **Admin Login**: ✅ Working
- **Current Data**: 44 products, 58 orders in database

---

## 🧪 Manual Browser Tests (Step by Step)

### TEST 1: Admin Login ✅
1. Open: https://cakestyles.vercel.app/admin/login
2. Enter:
   - Email: `owner@cakestyles.test`
   - Password: `Cakestyles@123`
3. Click "Sign in"
4. ✅ Expected: Dashboard appears

---

### TEST 2: View Existing Products in Admin
1. In admin panel, click "Products" in sidebar
2. ✅ Expected: See list of 44 products
3. Pick any product, click "Edit"
4. Note the product name for next test

---

### TEST 3: Edit Product in Admin → Check Frontend Sync
1. In admin products, edit any product:
   - Change name to: `[TEST] [Original Name]`
   - Or change price by ₹10
   - Click "Save"
2. ✅ Expected: Success message shown
3. Open new browser tab: https://cakestyles.vercel.app/menu
4. Find the product you just edited
5. ✅ Expected: Changes appear immediately
6. **This confirms: Admin → Database → Frontend sync works**

---

### TEST 4: Create New Product in Admin
1. In admin, go to Products
2. Click "Add Product" or "New Product"
3. Fill in:
   ```
   Name: E2E Test Chocolate Cake
   Category: Cakes
   Price: 599
   Description: This is a test product to verify end-to-end sync
   Available: Yes (checked)
   Tags: test, e2e
   ```
4. (Optional) Upload any test image
5. Click "Save" or "Create"
6. ✅ Expected: Product created, appears in products list

---

### TEST 5: Verify New Product on Frontend
1. Go to: https://cakestyles.vercel.app/menu
2. Look for "E2E Test Chocolate Cake"
3. ✅ Expected: Product card appears with correct price ₹599
4. Click on the product card
5. ✅ Expected: Product detail page opens with:
   - Name: E2E Test Chocolate Cake
   - Price: ₹599
   - Description shown
6. **This confirms: Admin product creation → Frontend sync works**

---

### TEST 6: Add Product to Cart
1. On the product detail page, click "Add to Cart"
2. ✅ Expected: Cart badge updates (shows "1" or increments)
3. Add another product to cart
4. Click cart icon (top right)
5. ✅ Expected: Cart modal/page shows:
   - Both products listed
   - Correct names and prices
   - Quantity controls work
   - Subtotal calculated correctly

---

### TEST 7: Checkout Flow - Store Pickup (No Payment)
1. In cart, click "Checkout" or "Proceed to Checkout"
2. **Fulfilment Modal**: Click "Store Pickup"
3. ✅ Expected: Redirects to checkout page
4. **Date/Time**: Select any future date and time slot
5. **Customer Details**: Fill in:
   ```
   Name: Test Customer
   Email: test@example.com
   Phone: 9876543210
   ```
6. **Special Instructions**: `E2E test order - pickup - no payment`
7. **Review Order**: Verify all items and total
8. Click "Place Order" (payment should be skipped for now)
9. ✅ Expected:
   - Order confirmation page appears
   - Order ID displayed
   - Status shows "Pending Payment" or similar

---

### TEST 8: Verify Order in Admin Backend
1. Go back to admin panel
2. Click "Orders" in sidebar
3. ✅ Expected: Your test order appears at the top (most recent)
4. Click on the order to view details
5. ✅ Expected: Order shows:
   ```
   Customer: Test Customer
   Email: test@example.com
   Phone: 9876543210
   Fulfilment: Pickup
   Items: E2E Test Chocolate Cake (and other items you added)
   Status: Pending Payment
   Special Instructions: E2E test order - pickup - no payment
   Order ID matches confirmation page
   ```
6. **This confirms: Frontend order → Backend database works**

---

### TEST 9: Update Order Status in Admin
1. In the order detail page (admin)
2. Find "Status" dropdown or button
3. Change status from "Pending Payment" to "Confirmed"
4. Click "Save" or "Update"
5. ✅ Expected: Status saved successfully
6. Refresh the page
7. ✅ Expected: Status still shows "Confirmed" (persisted to database)

---

### TEST 10: Track Order from Frontend (Optional)
1. Copy the Order ID from confirmation page or admin
2. Go to: https://cakestyles.vercel.app/track
3. Paste the Order ID
4. Click "Track Order"
5. ✅ Expected: Order details appear with status "Confirmed"
6. **This confirms: Status updates in admin → Frontend track page sync**

---

### TEST 11: Checkout Flow - Delivery with Map
1. Add items to cart again
2. Go to checkout
3. **Fulfilment Modal**: Click "Delivery"
4. Click "Continue" through the delivery note screen
5. **Address Screen Appears**:
   
   **Map Interaction**:
   - Click "Use my current location" button
   - ✅ Expected: Browser shows permission popup:
     ```
     cakestyles.vercel.app is asking to
     Know your location
     [Block] [Allow]
     ```
   - Click "Allow"
   - ✅ Expected: Map centers on your location with red marker
   
   **OR Manual Map Selection**:
   - Click anywhere on the map
   - ✅ Expected: Red marker moves to that location
   - OR drag the marker to different location
   
   **Address Auto-Fill**:
   - ✅ Expected: After selecting location:
     - Address fields auto-populate (from reverse geocoding)
     - Distance shown: "X.X km away"
     - Delivery fee calculated (internally ₹18/km, rounded up)

6. **Complete Address**: Fill in remaining fields:
   ```
   Address line: 123 Test Street
   City: (should be auto-filled)
   Pincode: (should be auto-filled, or enter manually)
   ```

7. **Contact Details**: Fill in:
   ```
   Name: Test Customer Delivery
   Email: delivery@example.com
   Phone: 9876543210
   ```

8. **Special Instructions**: `E2E test - delivery with map coordinates`

9. **Review**: Check that delivery fee is added to total

10. Click "Place Order"

11. ✅ Expected: Order confirmation with delivery details

---

### TEST 12: Verify Delivery Order in Admin
1. Go to admin → Orders
2. Find the delivery order (most recent)
3. Click to view details
4. ✅ Expected: Order contains:
   ```
   Fulfilment: Delivery
   Address:
     - Street: 123 Test Street
     - City: (auto-filled city)
     - Pincode: (auto-filled pincode)
     - Latitude: (number, e.g., 19.0760)
     - Longitude: (number, e.g., 72.8777)
     - Distance: (X.X km)
   Delivery Fee: ₹XX (calculated by server)
   Total: Subtotal + Delivery Fee
   ```
5. **This confirms**:
   - Map coordinates captured ✅
   - Distance calculated ✅
   - Server recalculated delivery fee independently ✅
   - Frontend → Backend delivery sync works ✅

---

### TEST 13: Delete Test Product
1. In admin → Products
2. Find "E2E Test Chocolate Cake"
3. Click "Delete" or trash icon
4. Confirm deletion
5. ✅ Expected: Product removed from list
6. Go to frontend: https://cakestyles.vercel.app/menu
7. Search for the product
8. ✅ Expected: Product no longer appears
9. **This confirms: Admin delete → Frontend sync works**

---

## 📋 Test Results Checklist

| Test | Pass/Fail | Notes |
|------|-----------|-------|
| Admin Login | ⬜ | |
| View Products in Admin | ⬜ | |
| Edit Product → Frontend Sync | ⬜ | |
| Create Product in Admin | ⬜ | |
| New Product on Frontend | ⬜ | |
| Add to Cart | ⬜ | |
| Checkout - Pickup | ⬜ | |
| Order in Admin Backend | ⬜ | |
| Update Order Status | ⬜ | |
| Track Order | ⬜ | |
| Checkout - Delivery + Map | ⬜ | |
| Location Permission Prompt | ⬜ | |
| Map Marker Interaction | ⬜ | |
| Distance Calculation | ⬜ | |
| Delivery Order in Backend | ⬜ | |
| Server Delivery Fee Validation | ⬜ | |
| Delete Product → Frontend Sync | ⬜ | |

---

## 🎯 Key Things to Verify

### Location Permission (Like Your Screenshot)
- When you click "Use my current location"
- Browser native prompt appears: "Know your location"
- This is automatic - no code changes needed
- Works on both localhost and production

### Backend ↔ Frontend Sync
- ✅ Admin creates/edits product → Appears on public menu
- ✅ Frontend creates order → Appears in admin panel
- ✅ Admin updates order → Track page shows updated status
- ✅ Admin deletes product → Disappears from public menu

### Delivery Map & Pricing
- ✅ Map loads with Google Maps
- ✅ User can click to select location
- ✅ Marker is draggable
- ✅ Address auto-fills from coordinates
- ✅ Distance calculated (Haversine formula)
- ✅ Delivery fee: `Math.ceil(distanceKm) * 18`
- ✅ Server recalculates fee (doesn't trust client)
- ✅ Coordinates saved with order

---

## 🚨 If Map Doesn't Load

Check console (F12 → Console tab) for errors:
- Missing API key → Need to add `VITE_GOOGLE_MAPS_API_KEY` to Vercel
- API key restriction → Check Google Cloud Console

---

## 📝 Notes

- **No Payment Integration Yet**: Orders will show "Pending Payment" status
- **Production Database**: All test orders will be real data in your database
- **Clean Up**: Delete test products/orders after testing via admin panel
- **Local Development**: Your local setup can't connect to MongoDB due to DNS issue
  - Fix DNS settings (see MONGODB_CONNECTION_FIX.md)
  - OR continue testing only on production

---

## ✅ Expected Outcome

After completing all tests, you will have verified:

1. ✅ **Complete E2E flow works**: Product creation → Cart → Checkout → Order
2. ✅ **Admin ↔ Frontend sync**: All CRUD operations sync correctly
3. ✅ **Location permission**: Browser native prompt works
4. ✅ **Delivery map**: Coordinates captured, distance calculated, pricing applied
5. ✅ **Backend security**: Server validates and recalculates all pricing
6. ✅ **Order tracking**: Status updates flow through the system

---

## 🎉 Success Criteria

All checkboxes in "Test Results Checklist" are checked ✅

The system is ready for Razorpay payment integration!
