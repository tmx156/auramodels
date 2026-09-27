/**
 * Packages API Routes
 * Handles package definitions and pricing for photography services
 */

const express = require('express');
const { auth } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const router = express.Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

/**
 * @route   GET /api/packages
 * @desc    Get all active packages
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const { type, includeInactive } = req.query;

    let query = supabase
      .from('packages')
      .select('*')
      .order('display_order', { ascending: true });

    // Filter by type if specified
    if (type && ['main', 'individual'].includes(type)) {
      query = query.eq('type', type);
    }

    // Only show active packages unless admin requests all
    if (!includeInactive || req.user.role !== 'admin') {
      query = query.eq('is_active', true);
    }

    const { data: packages, error } = await query;

    if (error) {
      console.error('Error fetching packages:', error);
      return res.status(500).json({ message: 'Failed to fetch packages', error: error.message });
    }

    // Transform for frontend
    const transformedPackages = packages.map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      code: pkg.code,
      type: pkg.type,
      price: parseFloat(pkg.price),
      vatInclusive: pkg.vat_inclusive,
      vatRate: parseFloat(pkg.vat_rate || 20),
      imageCount: pkg.image_count,
      includes: pkg.includes || [],
      totalValue: pkg.total_value ? parseFloat(pkg.total_value) : null,
      description: pkg.description,
      displayOrder: pkg.display_order,
      isActive: pkg.is_active,
      createdAt: pkg.created_at,
      updatedAt: pkg.updated_at
    }));

    res.json({
      success: true,
      packages: transformedPackages,
      mainPackages: transformedPackages.filter(p => p.type === 'main'),
      individualPackages: transformedPackages.filter(p => p.type === 'individual')
    });
  } catch (error) {
    console.error('Error fetching packages:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/packages/:id
 * @desc    Get single package by ID or code
 * @access  Private
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Try to find by ID first, then by code
    let query = supabase.from('packages').select('*');

    // Check if it's a UUID or a code
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (isUUID) {
      query = query.eq('id', id);
    } else {
      query = query.eq('code', id.toLowerCase());
    }

    const { data: pkg, error } = await query.single();

    if (error || !pkg) {
      return res.status(404).json({ message: 'Package not found' });
    }

    res.json({
      success: true,
      package: {
        id: pkg.id,
        name: pkg.name,
        code: pkg.code,
        type: pkg.type,
        price: parseFloat(pkg.price),
        vatInclusive: pkg.vat_inclusive,
        vatRate: parseFloat(pkg.vat_rate || 20),
        imageCount: pkg.image_count,
        includes: pkg.includes || [],
        totalValue: pkg.total_value ? parseFloat(pkg.total_value) : null,
        description: pkg.description,
        displayOrder: pkg.display_order,
        isActive: pkg.is_active,
        createdAt: pkg.created_at,
        updatedAt: pkg.updated_at
      }
    });
  } catch (error) {
    console.error('Error fetching package:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/packages
 * @desc    Create a new package
 * @access  Private (Admin only)
 */
router.post('/', auth, async (req, res) => {
  try {
    // Only admin can create packages
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can create packages' });
    }

    const {
      name,
      code,
      type,
      price,
      vatInclusive = true,
      vatRate = 20,
      imageCount,
      includes,
      totalValue,
      description,
      displayOrder
    } = req.body;

    // Validate required fields
    if (!name || !code || !type || price === undefined) {
      return res.status(400).json({ message: 'Name, code, type, and price are required' });
    }

    if (!['main', 'individual'].includes(type)) {
      return res.status(400).json({ message: 'Type must be "main" or "individual"' });
    }

    // Check for duplicate code
    const { data: existing } = await supabase
      .from('packages')
      .select('id')
      .eq('code', code.toLowerCase())
      .single();

    if (existing) {
      return res.status(400).json({ message: 'A package with this code already exists' });
    }

    const packageData = {
      name,
      code: code.toLowerCase(),
      type,
      price: parseFloat(price),
      vat_inclusive: vatInclusive,
      vat_rate: parseFloat(vatRate),
      image_count: imageCount || null,
      includes: includes || [],
      total_value: totalValue ? parseFloat(totalValue) : null,
      description: description || null,
      display_order: displayOrder || 0,
      is_active: true
    };

    const { data: newPackage, error } = await supabase
      .from('packages')
      .insert(packageData)
      .select()
      .single();

    if (error) {
      console.error('Error creating package:', error);
      return res.status(500).json({ message: 'Failed to create package', error: error.message });
    }

    res.status(201).json({
      success: true,
      message: 'Package created successfully',
      package: {
        id: newPackage.id,
        name: newPackage.name,
        code: newPackage.code,
        type: newPackage.type,
        price: parseFloat(newPackage.price),
        vatInclusive: newPackage.vat_inclusive,
        vatRate: parseFloat(newPackage.vat_rate),
        imageCount: newPackage.image_count,
        includes: newPackage.includes || [],
        totalValue: newPackage.total_value ? parseFloat(newPackage.total_value) : null,
        description: newPackage.description,
        displayOrder: newPackage.display_order,
        isActive: newPackage.is_active
      }
    });
  } catch (error) {
    console.error('Error creating package:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   PUT /api/packages/:id
 * @desc    Update a package
 * @access  Private (Admin only)
 */
router.put('/:id', auth, async (req, res) => {
  try {
    // Only admin can update packages
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can update packages' });
    }

    const { id } = req.params;
    const {
      name,
      code,
      type,
      price,
      vatInclusive,
      vatRate,
      imageCount,
      includes,
      totalValue,
      description,
      displayOrder,
      isActive
    } = req.body;

    // Check package exists
    const { data: existing, error: fetchError } = await supabase
      .from('packages')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Package not found' });
    }

    // Check for duplicate code if changing
    if (code && code.toLowerCase() !== existing.code) {
      const { data: codeExists } = await supabase
        .from('packages')
        .select('id')
        .eq('code', code.toLowerCase())
        .neq('id', id)
        .single();

      if (codeExists) {
        return res.status(400).json({ message: 'A package with this code already exists' });
      }
    }

    // Build update object
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (code !== undefined) updates.code = code.toLowerCase();
    if (type !== undefined) {
      if (!['main', 'individual'].includes(type)) {
        return res.status(400).json({ message: 'Type must be "main" or "individual"' });
      }
      updates.type = type;
    }
    if (price !== undefined) updates.price = parseFloat(price);
    if (vatInclusive !== undefined) updates.vat_inclusive = vatInclusive;
    if (vatRate !== undefined) updates.vat_rate = parseFloat(vatRate);
    if (imageCount !== undefined) updates.image_count = imageCount;
    if (includes !== undefined) updates.includes = includes;
    if (totalValue !== undefined) updates.total_value = totalValue ? parseFloat(totalValue) : null;
    if (description !== undefined) updates.description = description;
    if (displayOrder !== undefined) updates.display_order = displayOrder;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data: updatedPackage, error } = await supabase
      .from('packages')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating package:', error);
      return res.status(500).json({ message: 'Failed to update package', error: error.message });
    }

    res.json({
      success: true,
      message: 'Package updated successfully',
      package: {
        id: updatedPackage.id,
        name: updatedPackage.name,
        code: updatedPackage.code,
        type: updatedPackage.type,
        price: parseFloat(updatedPackage.price),
        vatInclusive: updatedPackage.vat_inclusive,
        vatRate: parseFloat(updatedPackage.vat_rate),
        imageCount: updatedPackage.image_count,
        includes: updatedPackage.includes || [],
        totalValue: updatedPackage.total_value ? parseFloat(updatedPackage.total_value) : null,
        description: updatedPackage.description,
        displayOrder: updatedPackage.display_order,
        isActive: updatedPackage.is_active
      }
    });
  } catch (error) {
    console.error('Error updating package:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   DELETE /api/packages/:id
 * @desc    Delete a package (soft delete - sets is_active to false)
 * @access  Private (Admin only)
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    // Only admin can delete packages
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can delete packages' });
    }

    const { id } = req.params;

    // Soft delete by setting is_active to false
    const { data: deletedPackage, error } = await supabase
      .from('packages')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error deleting package:', error);
      return res.status(500).json({ message: 'Failed to delete package', error: error.message });
    }

    if (!deletedPackage) {
      return res.status(404).json({ message: 'Package not found' });
    }

    res.json({
      success: true,
      message: 'Package deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting package:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/packages/calculate-total
 * @desc    Calculate total for selected packages
 * @access  Private
 */
router.post('/calculate-total', auth, async (req, res) => {
  try {
    const { items } = req.body; // [{packageId, quantity}]

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items array is required' });
    }

    const packageIds = items.map(item => item.packageId);

    const { data: packages, error } = await supabase
      .from('packages')
      .select('*')
      .in('id', packageIds)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching packages:', error);
      return res.status(500).json({ message: 'Failed to calculate total', error: error.message });
    }

    let subtotal = 0;
    let vatAmount = 0;
    const lineItems = [];

    for (const item of items) {
      const pkg = packages.find(p => p.id === item.packageId);
      if (!pkg) continue;

      const quantity = item.quantity || 1;
      const lineTotal = parseFloat(pkg.price) * quantity;

      if (pkg.vat_inclusive) {
        // Price includes VAT - extract VAT amount
        const vatRate = parseFloat(pkg.vat_rate || 20);
        const vatMultiplier = vatRate / 100;
        const netAmount = lineTotal / (1 + vatMultiplier);
        const itemVat = lineTotal - netAmount;

        subtotal += netAmount;
        vatAmount += itemVat;
      } else {
        // Price excludes VAT - add VAT
        const vatRate = parseFloat(pkg.vat_rate || 20);
        const itemVat = lineTotal * (vatRate / 100);

        subtotal += lineTotal;
        vatAmount += itemVat;
      }

      lineItems.push({
        packageId: pkg.id,
        code: pkg.code,
        name: pkg.name,
        type: pkg.type,
        unitPrice: parseFloat(pkg.price),
        quantity,
        lineTotal,
        vatInclusive: pkg.vat_inclusive,
        vatRate: parseFloat(pkg.vat_rate || 20)
      });
    }

    const total = subtotal + vatAmount;

    res.json({
      success: true,
      calculation: {
        items: lineItems,
        subtotal: Math.round(subtotal * 100) / 100,
        vatAmount: Math.round(vatAmount * 100) / 100,
        total: Math.round(total * 100) / 100,
        currency: 'GBP'
      }
    });
  } catch (error) {
    console.error('Error calculating total:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
