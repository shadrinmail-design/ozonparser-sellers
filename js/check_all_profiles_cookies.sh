#!/bin/bash

echo "🔍 Checking all Chrome profiles for Ozon cookies..."
echo ""

for profile in "Default" "Profile 1" "Profile 2" "Profile 3" "Profile 5" "Profile 6" "Profile 7" "Profile 9" "Profile 10" "Profile 11" "Profile 12"; do
  echo "Checking: $profile"
  node extract_cookies_sqlite.js "$profile" 2>&1 | grep -A 2 "Found"
  echo ""
done
