#!/bin/bash

# Creator Selection Tracking Migration Script
# This script runs the database migration to add budget-based selection tracking

echo "🚀 Running Creator Selection Tracking Migration..."
echo "================================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is not set"
    echo "Please set it with: export DATABASE_URL='your-database-url'"
    exit 1
fi

# Run the migration
echo "📊 Executing SQL migration..."
psql "$DATABASE_URL" -f add-creator-selection-tracking.sql

# Check if migration was successful
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "  1. Restart your backend server: cd .. && npm run dev"
    echo "  2. Test the endpoints:"
    echo "     - GET /api/campaigns/:id/selection-status"
    echo "     - POST /api/campaigns/:id/validate-selection"
    echo "     - POST /api/campaigns/:id/initiate-payment"
    echo ""
    echo "🔍 To verify the migration:"
    echo "  psql \$DATABASE_URL -c \"\\d campaigns\""
    echo "  psql \$DATABASE_URL -c \"\\d campaign_creators\""
    echo "  psql \$DATABASE_URL -c \"\\df validate_creator_selection\""
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    exit 1
fi
