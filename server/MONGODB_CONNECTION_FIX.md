# MongoDB Connection Issue Fix

## Problem
```
Error: querySrv ECONNREFUSED _mongodb._tcp.cluster0.smaitrp.mongodb.net
```

DNS cannot resolve MongoDB Atlas hostname. Confirmed by:
- `ping cluster0.smaitrp.mongodb.net` → Host not found
- `nslookup _mongodb._tcp.cluster0.smaitrp.mongodb.net` → No records

## Solutions (Try in Order)

### Solution 1: Change DNS Settings (Recommended)
Your current DNS server (10.142.68.179) cannot resolve MongoDB domains.

**Windows DNS Change**:
1. Open Control Panel → Network and Internet → Network Connections
2. Right-click your active network → Properties
3. Select "Internet Protocol Version 4 (TCP/IPv4)" → Properties
4. Select "Use the following DNS server addresses"
5. Set:
   - Preferred DNS: `8.8.8.8` (Google DNS)
   - Alternate DNS: `1.1.1.1` (Cloudflare DNS)
6. Click OK, close all windows
7. Open Command Prompt and run:
   ```cmd
   ipconfig /flushdns
   ```
8. Test: `ping cluster0.smaitrp.mongodb.net`

### Solution 2: Use VPN or Different Network
- Try connecting via mobile hotspot
- Use a VPN if corporate network is blocking MongoDB
- Try a different WiFi network

### Solution 3: Test with Production (Vercel)
Since local connection is blocked but Vercel works:

**Test the full flow on production instead**:
```bash
# Base URL
PROD_URL=https://cakestyles.vercel.app

# 1. Test health
curl $PROD_URL/api/health

# 2. Login and get token
curl -X POST $PROD_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@cakestyles.test","password":"Cakestyles@123"}'

# 3. Use the admin panel
# Visit: https://cakestyles.vercel.app/admin/login
```

Then follow the E2E test plan using production URLs instead of localhost.

### Solution 4: Use MongoDB Compass for Testing
1. Download MongoDB Compass: https://www.mongodb.com/products/compass
2. Use your connection string from `.env`
3. Verify you can connect and see data
4. If Compass can't connect either, it confirms network/DNS issue

### Solution 5: Check Windows Firewall
1. Search "Windows Defender Firewall"
2. Click "Allow an app through firewall"
3. Ensure Node.js is allowed for both Private and Public networks

### Solution 6: Flush DNS and Reset Network
```cmd
ipconfig /flushdns
ipconfig /release
ipconfig /renew
netsh winsock reset
```
Restart computer after running these.

## Quick Test After Fix

Once DNS is working:
```bash
# Should respond with IP address
ping cluster0.smaitrp.mongodb.net

# Start backend
cd server
npm start

# Should see: 🧁 Cakestyles server running on port 5000
```

## Alternative: Test on Production Only

Since your production deployment works fine, you can:
1. **Use production for all E2E tests**
2. **Admin URL**: https://cakestyles.vercel.app/admin/login
3. **Public URL**: https://cakestyles.vercel.app

All the tests in [E2E_TEST_PLAN.md](E2E_TEST_PLAN.md) can be run on production instead of localhost.

⚠️ **Note**: Production and local share the same MongoDB database, so any data you create will appear in both places once local connection works.

## If Nothing Works

Your network administrator or ISP might be blocking MongoDB Atlas domains. In that case:
- Use production (Vercel) for all testing
- Deploy changes and test on production
- Consider using a VPN for local development
