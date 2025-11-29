const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Get creators with pagination and filtering
router.get('/creators', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      category = 'all',
      subcategory = 'all'
    } = req.query;

    const start = (parseInt(page) - 1) * parseInt(limit);
    const end = start + parseInt(limit) - 1;

    let query = supabase
      .from('creators')
      .select('*', { count: 'exact' })
      .range(start, end);

    // Apply search filter
    if (search && search.trim()) {
      query = query.or(`name.ilike.%${search.trim()}%,ig_handle.ilike.%${search.trim()}%`);
    }

    // Apply category filter - filter by category field (main category)
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    // Apply subcategory filter
    if (subcategory && subcategory !== 'all') {
      query = query.eq('subcategory', subcategory);
    }

    // Order by name for consistent results
    query = query.order('name', { ascending: true });

    const { data, error, count } = await query;

    if (error) {
      return res.status(500).json({ 
        error: 'Database query failed', 
        details: error.message 
      });
    }

    res.json({
      creators: data || [],
      totalCount: count || 0,
      currentPage: parseInt(page),
      totalPages: Math.ceil((count || 0) / parseInt(limit)),
      hasMore: end < (count || 0) - 1
    });

  } catch (err) {
    res.status(500).json({ 
      error: 'Internal server error', 
      details: err.message 
    });
  }
});

// Get unique categories for filtering
router.get('/creators/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('creator_categories_summary')
      .select('*')
      .order('creator_count', { ascending: false });
    
    if (error) {
      return res.status(500).json({ 
        error: 'Failed to fetch categories', 
        details: error.message 
      });
    }

    // Transform to frontend-friendly format
    const categories = data.map(cat => ({
      category: cat.category,
      name: cat.category,
      creator_count: cat.creator_count,
      count: cat.creator_count,
      subcategories: cat.subcategories || [],
      follower_range: {
        min: cat.min_followers,
        max: cat.max_followers,
        avg: cat.avg_followers
      },
      by_tier: {
        micro: cat.micro_count || 0,
        macro: cat.macro_count || 0,
        mega: cat.mega_count || 0
      }
    }));

    res.json({ 
      success: true,
      categories,
      total: categories.length 
    });

  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: err.message 
    });
  }
});

// Test database connection and table structure
router.get('/creators/test', async (req, res) => {
  try {
    // Test basic connection
    const { data: testData, error: testError } = await supabase
      .from('creators')
      .select('count(*)', { count: 'exact' })
      .limit(1);

    if (testError) {
      return res.status(500).json({ 
        error: 'Cannot access creators table', 
        details: testError.message,
        suggestion: 'Check if the creators table exists in your Supabase database'
      });
    }

    // Get a sample record to show table structure
    const { data: sampleData, error: sampleError } = await supabase
      .from('creators')
      .select('*')
      .limit(3);

    const totalCount = testData?.[0]?.count || 0;

    res.json({
      status: 'success',
      message: 'Creators table is accessible',
      totalRecords: totalCount,
      sampleRecords: sampleData || [],
      tableStructure: sampleData?.length > 0 ? Object.keys(sampleData[0]) : []
    });

  } catch (err) {
    res.status(500).json({ 
      error: 'Database connection failed', 
      details: err.message 
    });
  }
});

// Get single creator by ID
router.get('/creators/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: creator, error } = await supabase
      .from('creators')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(500).json({ 
        error: 'Database query failed', 
        details: error.message 
      });
    }

    if (!creator) {
      return res.status(404).json({ 
        error: 'Creator not found',
        message: `No creator found with ID: ${id}` 
      });
    }

    res.json({
      success: true,
      creator
    });

  } catch (err) {
    res.status(500).json({ 
      error: 'Internal server error', 
      details: err.message 
    });
  }
});

module.exports = router;