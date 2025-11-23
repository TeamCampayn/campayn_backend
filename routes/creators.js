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
      category = 'all' 
    } = req.query;

    const start = (parseInt(page) - 1) * parseInt(limit);
    const end = start + parseInt(limit) - 1;

    console.log('Fetching creators with params:', { page, limit, search, category, start, end });

    let query = supabase
      .from('creators')
      .select('*', { count: 'exact' })
      .range(start, end);

    // Apply search filter
    if (search && search.trim()) {
      query = query.or(`name.ilike.%${search.trim()}%,ig_handle.ilike.%${search.trim()}%`);
    }

    // Apply category filter
    if (category && category !== 'all') {
      query = query.eq('subcategory', category);
    }

    // Order by name for consistent results
    query = query.order('name', { ascending: true });

    const { data, error, count } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ 
        error: 'Database query failed', 
        details: error.message 
      });
    }

    console.log(`Found ${count} total creators, returning ${data?.length || 0} for page ${page}`);

    res.json({
      creators: data || [],
      totalCount: count || 0,
      currentPage: parseInt(page),
      totalPages: Math.ceil((count || 0) / parseInt(limit)),
      hasMore: end < (count || 0) - 1
    });

  } catch (err) {
    console.error('Error fetching creators:', err);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: err.message 
    });
  }
});

// Get unique categories for filtering
router.get('/creators/categories', async (req, res) => {
  try {
    console.log('Fetching creator categories...');

    const { data, error } = await supabase
      .from('creators')
      .select('subcategory')
      .not('subcategory', 'is', null);

    if (error) {
      console.error('Supabase error fetching categories:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch categories', 
        details: error.message 
      });
    }

    const uniqueCategories = [...new Set(data.map(item => item.subcategory))]
      .filter(category => category && category.trim())
      .sort();

    console.log(`Found ${uniqueCategories.length} unique categories`);

    res.json({ categories: uniqueCategories });

  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: err.message 
    });
  }
});

// Test database connection and table structure
router.get('/creators/test', async (req, res) => {
  try {
    console.log('Testing creators table...');

    // Test basic connection
    const { data: testData, error: testError } = await supabase
      .from('creators')
      .select('count(*)', { count: 'exact' })
      .limit(1);

    if (testError) {
      console.error('Table access error:', testError);
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

    if (sampleError) {
      console.error('Sample data error:', sampleError);
    }

    const totalCount = testData?.[0]?.count || 0;

    res.json({
      status: 'success',
      message: 'Creators table is accessible',
      totalRecords: totalCount,
      sampleRecords: sampleData || [],
      tableStructure: sampleData?.length > 0 ? Object.keys(sampleData[0]) : []
    });

  } catch (err) {
    console.error('Error testing creators table:', err);
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

    console.log('Fetching creator with ID:', id);

    const { data: creator, error } = await supabase
      .from('creators')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Supabase error:', error);
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

    console.log('Found creator:', creator.name, creator.ig_handle);

    res.json({
      success: true,
      creator
    });

  } catch (err) {
    console.error('Error fetching creator by ID:', err);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: err.message 
    });
  }
});

module.exports = router;