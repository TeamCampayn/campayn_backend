#!/bin/bash

# Automated Creator Recommendation System - Verification Script
# Run this to verify all components are working

echo "🔍 Verifying Automated Creator Recommendation System"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Database - Verify new columns exist
echo "📊 Check 1: Database Schema"
echo "Run this in Supabase SQL Editor:"
echo ""
echo "SELECT column_name FROM information_schema.columns"
echo "WHERE table_name = 'campaigns'"
echo "AND column_name IN ('target_category', 'target_subcategory', 'creator_type');"
echo ""
echo "Expected: 3 rows"
echo ""
read -p "Press Enter after checking..."

# Check 2: Verify creators imported
echo ""
echo "📁 Check 2: Creator Data"
echo "Run this in Supabase SQL Editor:"
echo ""
echo "SELECT"
echo "  COUNT(*) as total_creators,"
echo "  COUNT(DISTINCT category) as total_categories"
echo "FROM creators;"
echo ""
echo "Expected: ~37,000 creators, 30+ categories"
echo ""
read -p "Press Enter after checking..."

# Check 3: Verify categories view works
echo ""
echo "🏷️  Check 3: Categories View"
echo "Run this in Supabase SQL Editor:"
echo ""
echo "SELECT * FROM creator_categories_summary LIMIT 5;"
echo ""
echo "Expected: Shows categories with creator counts, subcategories, tier breakdown"
echo ""
read -p "Press Enter after checking..."

# Check 4: Test recommendation function
echo ""
echo "🎯 Check 4: Recommendation Function"
echo "Run this in Supabase SQL Editor:"
echo ""
echo "SELECT * FROM recommend_creators('Arts', 'Acting, Pro (TV / Series)', 'mega', 5);"
echo ""
echo "Expected: 5 creators from Arts category, Acting subcategory, mega tier (100K-2M)"
echo ""
read -p "Press Enter after checking..."

# Check 5: Test backend API (if running)
echo ""
echo "🔌 Check 5: Backend API Endpoints"
echo "Make sure backend is running (cd backend && npm start)"
echo ""
read -p "Is backend running? (y/n): " backend_running

if [[ $backend_running == "y" ]]; then
    echo ""
    echo "Testing API endpoints..."
    echo ""
    
    # Test categories endpoint
    echo "GET /api/creators/categories"
    response=$(curl -s http://localhost:4000/api/creators/categories)
    if [[ $response == *"success"* ]]; then
        echo -e "${GREEN}✅ Categories endpoint working${NC}"
    else
        echo -e "${RED}❌ Categories endpoint failed${NC}"
    fi
    
    echo ""
    echo "Sample response:"
    echo $response | head -c 200
    echo "..."
    echo ""
else
    echo -e "${YELLOW}⚠️  Skipping API tests. Start backend with: cd backend && npm start${NC}"
fi

# Check 6: Frontend files updated
echo ""
echo "💻 Check 6: Frontend Files"
echo ""

if grep -q "targetCategory" ../zestful-campaign-craft-69/src/components/CampaignForm.tsx 2>/dev/null; then
    echo -e "${GREEN}✅ CampaignForm.tsx updated${NC}"
else
    echo -e "${RED}❌ CampaignForm.tsx missing updates${NC}"
fi

if grep -q "generateAutoRecommendations" ../zestful-campaign-craft-69/src/components/AdminCreatorSelection.tsx 2>/dev/null; then
    echo -e "${GREEN}✅ AdminCreatorSelection.tsx updated${NC}"
else
    echo -e "${RED}❌ AdminCreatorSelection.tsx missing updates${NC}"
fi

# Summary
echo ""
echo "=================================================="
echo "🎯 Verification Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Create a test campaign with category selection"
echo "2. As admin, click 'Auto-Generate Recommendations'"
echo "3. Verify 10-15 relevant creators appear"
echo ""
echo "📚 For detailed testing instructions, see:"
echo "   IMPLEMENTATION_COMPLETE.md"
echo ""
