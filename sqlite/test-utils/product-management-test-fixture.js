// @ts-check

import { join } from 'node:path';

import { CoreAccountingTestFixture } from './core-accounting-test-fixture.js';

const __dirname = new URL('..', import.meta.url).pathname;

/**
 * Product Management Test Fixture
 *
 * This fixture extends the core accounting test fixture to provide product
 * management-specific testing utilities. It includes methods for creating
 * product categories, products, variants, vendors, and testing relationships.
 */
export class ProductManagementTestFixture extends CoreAccountingTestFixture {
  /**
   * @param {string} label
   */
  constructor(label) {
    super(label);
    this.productSchemaPath = join(__dirname, '004_product_management.sql');
  }

  /**
   * Sets up the database with core accounting and product management schemas
   * @returns {Promise<DatabaseSync>} The initialized database
   */
  async setup() {
    // Setup core accounting first
    await super.setup();

    // Load and execute product management schema
    const { readFile } = await import('node:fs/promises');
    const productSchemaContent = await readFile(this.productSchemaPath, { encoding: 'utf8' });
    this.db.exec(productSchemaContent);

    return this.db;
  }

  /**
   * Sets up the database with initial capital and product management schemas
   * @param {number} amount - Initial capital amount in cents (default: 100000 = $1000)
   * @returns {Promise<DatabaseSync>} The initialized database
   */
  async setupWithInitialCapital(amount = 100000) {
    await this.setup();
    this.createAndPostJournalEntry('Initial capital', [
      { accountCode: 10100, debit: amount, credit: 0 }, // Cash
      { accountCode: 30100, debit: 0, credit: amount }, // Common Stock
    ]);
    return this.db;
  }

  /**
   * Creates a product category
   * @param {string} code - Category code
   * @param {string} name - Category name
   * @param {string} [description] - Category description
   * @param {number} [parentCategoryId] - Parent category ID for hierarchy
   * @returns {number} The created category ID
   */
  createProductCategory(code, name, description = null, parentCategoryId = null) {
    const result = this.db.prepare(`
      INSERT INTO product_category (code, name, description, parent_category_id)
      VALUES (?, ?, ?, ?)
    `).run(code, name, description, parentCategoryId);

    return Number(result.lastInsertRowid);
  }

  /**
   * Creates a product
   * @param {Object} options - Product configuration
   * @returns {number} The created product ID
   */
  createProduct(options = {}) {
    const {
      sku,
      name,
      description = null,
      productCategoryId = null,
      standardCost = 0,
      inventoryAccountCode = 10300,
      cogsAccountCode = 50100,
      salesAccountCode = 40100,
      costingMethod = 'FIFO',
      isActive = 1,
    } = options;

    const currentTime = Math.floor(Date.now() / 1000);

    const result = this.db.prepare(`
      INSERT INTO product (
        sku, name, description, product_category_id, standard_cost,
        inventory_account_code, cogs_account_code, sales_account_code,
        costing_method, is_active, created_time, updated_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sku, name, description, productCategoryId, standardCost,
      inventoryAccountCode, cogsAccountCode, salesAccountCode,
      costingMethod, isActive, currentTime, currentTime,
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * Creates a product variant
   * @param {Object} options - Variant configuration
   * @returns {number} The created variant ID
   */
  createProductVariant(options = {}) {
    const {
      productId,
      sku,
      name,
      variantAttributes = null,
      standardCost = 0,
      isActive = 1,
    } = options;

    const currentTime = Math.floor(Date.now() / 1000);

    const result = this.db.prepare(`
      INSERT INTO product_variant (
        product_id, sku, name, variant_attributes, standard_cost, is_active, created_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(productId, sku, name, variantAttributes, standardCost, isActive, currentTime);

    return Number(result.lastInsertRowid);
  }

  /**
   * Creates a vendor
   * @param {Object} options - Vendor configuration
   * @returns {number} The created vendor ID
   */
  createVendor(options = {}) {
    const {
      vendorCode,
      name,
      contactPerson = null,
      email = null,
      phone = null,
      paymentTermsDays = 30,
      isActive = 1,
    } = options;

    const currentTime = Math.floor(Date.now() / 1000);

    const result = this.db.prepare(`
      INSERT INTO vendor (
        vendor_code, name, contact_person, email, phone, payment_terms_days, is_active, created_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(vendorCode, name, contactPerson, email, phone, paymentTermsDays, isActive, currentTime);

    return Number(result.lastInsertRowid);
  }

  /**
   * Creates a vendor-product relationship
   * @param {Object} options - Vendor-product configuration
   * @returns {number} The created vendor-product ID
   */
  createVendorProduct(options = {}) {
    const {
      vendorId,
      productId,
      vendorSku = null,
      vendorName = null,
      unitPrice,
      minimumOrderQuantity = 1,
      leadTimeDays = 0,
      isPreferred = 0,
      isActive = 1,
    } = options;

    const currentTime = Math.floor(Date.now() / 1000);

    const result = this.db.prepare(`
      INSERT INTO vendor_product (
        vendor_id, product_id, vendor_sku, vendor_name, unit_price,
        minimum_order_quantity, lead_time_days, is_preferred, is_active, last_updated_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      vendorId, productId, vendorSku, vendorName, unitPrice,
      minimumOrderQuantity, leadTimeDays, isPreferred, isActive, currentTime,
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * Gets a product with its category information
   * @param {number} productId - Product ID
   * @returns {Object|null} Product with category information
   */
  getProduct(productId) {
    return this.db.prepare(`
      SELECT p.*, pc.name as category_name, pc.code as category_code
      FROM product p
      LEFT JOIN product_category pc ON p.product_category_id = pc.id
      WHERE p.id = ?
    `).get(productId);
  }

  /**
   * Gets all product variants for a product
   * @param {number} productId - Product ID
   * @returns {Array} Array of product variants
   */
  getProductVariants(productId) {
    return this.db.prepare(`
      SELECT * FROM product_variant
      WHERE product_id = ?
      ORDER BY name
    `).all(productId);
  }

  /**
   * Gets vendor-product relationships with details
   * @param {number|undefined} [vendorId] - Optional vendor ID filter
   * @param {number|undefined} [productId] - Optional product ID filter
   * @returns {Array} Array of vendor-product relationships
   */
  getVendorProducts(vendorId = undefined, productId = undefined) {
    let query = `
      SELECT vp.*, v.name as vendor_name, v.vendor_code, p.sku as product_sku, p.name as product_name
      FROM vendor_product vp
      JOIN vendor v ON v.id = vp.vendor_id
      JOIN product p ON p.id = vp.product_id
    `;

    const params = [];
    const conditions = [];

    if (vendorId !== undefined) {
      conditions.push('vp.vendor_id = ?');
      params.push(vendorId);
    }

    if (productId !== undefined) {
      conditions.push('vp.product_id = ?');
      params.push(productId);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY v.name, p.name';

    return this.db.prepare(query).all(...params);
  }

  /**
   * Verifies all product management tables exist
   * @returns {Object} Table existence status
   */
  verifyTablesExist() {
    const expectedTables = [
      'product_category',
      'unit_of_measure',
      'product',
      'product_variant',
      'vendor',
      'vendor_product',
    ];

    const existingTables = this.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN (${expectedTables.map(() => '?').join(',')})
    `).all(...expectedTables);

    const existingTableNames = existingTables.map(t => t.name);

    return {
      all: existingTableNames.length === expectedTables.length,
      missing: expectedTables.filter(table => !existingTableNames.includes(table)),
      existing: existingTableNames,
    };
  }

  /**
   * Verifies default data is populated
   * @returns {Object} Default data validation results
   */
  verifyDefaultData() {
    const unitsCount = this.db.prepare('SELECT COUNT(*) as count FROM unit_of_measure').get()?.count || 0;
    const categoriesCount = this.db.prepare('SELECT COUNT(*) as count FROM product_category').get()?.count || 0;
    const defaultVendor = this.db.prepare('SELECT * FROM vendor WHERE vendor_code = ?').get('SUPPLIER001');

    return {
      unitsOfMeasure: Number(unitsCount) > 0,
      productCategories: Number(categoriesCount) > 0,
      defaultVendor: !!defaultVendor,
      unitsCount: Number(unitsCount),
      categoriesCount: Number(categoriesCount),
    };
  }

  /**
   * Verifies unit conversion factors
   * @returns {Object} Unit conversion validation results
   */
  verifyUnitConversions() {
    const conversions = this.db.prepare(`
      SELECT code, base_unit_code, conversion_factor
      FROM unit_of_measure
      WHERE base_unit_code IS NOT NULL
      ORDER BY code
    `).all();

    const expectedConversions = {
      G: { baseUnit: 'KG', factor: 0.001 },
      LB: { baseUnit: 'KG', factor: 0.453592 },
      OZ: { baseUnit: 'LB', factor: 0.0625 },
      ML: { baseUnit: 'L', factor: 0.001 },
      CM: { baseUnit: 'M', factor: 0.01 },
      FT: { baseUnit: 'M', factor: 0.3048 },
      IN: { baseUnit: 'FT', factor: 0.0833333 },
    };

    const results = {};
    for (const conversion of conversions) {
      const code = conversion.code;
      const expected = expectedConversions[code];
      if (expected) {
        results[code] = {
          baseUnitCorrect: conversion.base_unit_code === expected.baseUnit,
          factorCorrect: Math.abs(conversion.conversion_factor - expected.factor) < 0.000001,
          actualFactor: conversion.conversion_factor,
          expectedFactor: expected.factor,
        };
      }
    }

    return results;
  }

  /**
   * Creates a complete product scenario for testing
   * @param {Object} options - Scenario configuration
   * @returns {Object} Created scenario data
   */
  createProductScenario(options = {}) {
    const {
      categoryCode = 'TEST-CAT',
      categoryName = 'Test Category',
      productSku = 'TEST-PROD-001',
      productName = 'Test Product',
      vendorCode = 'TEST-VENDOR',
      vendorName = 'Test Vendor Inc.',
      variantCount = 2,
    } = options;

    // Create category
    const categoryId = this.createProductCategory(categoryCode, categoryName, 'Test category for scenario');

    // Create product
    const productId = this.createProduct({
      sku: productSku,
      name: productName,
      description: 'Test product for scenario',
      productCategoryId: categoryId,
      standardCost: 1000,
    });

    // Create variants
    const variants = [];
    for (let i = 1; i <= variantCount; i++) {
      const variantId = this.createProductVariant({
        productId,
        sku: `${productSku}-VAR${i}`,
        name: `${productName} Variant ${i}`,
        variantAttributes: JSON.stringify({ variant: i }),
        standardCost: 1000 + (i * 100),
      });
      variants.push(variantId);
    }

    // Create vendor
    const vendorId = this.createVendor({
      vendorCode,
      name: vendorName,
      contactPerson: 'John Smith',
      email: 'john@testvendor.com',
    });

    // Create vendor-product relationship
    const vendorProductId = this.createVendorProduct({
      vendorId,
      productId,
      vendorSku: `VEN-${productSku}`,
      unitPrice: 1500,
      minimumOrderQuantity: 10,
      leadTimeDays: 7,
      isPreferred: 1,
    });

    return {
      categoryId,
      productId,
      vendorId,
      vendorProductId,
      variants,
      scenario: {
        categoryCode,
        categoryName,
        productSku,
        productName,
        vendorCode,
        vendorName,
      },
    };
  }

  /**
   * Validates product management integrity
   * @returns {Object} Validation results
   */
  validateProductManagementIntegrity() {
    const tableStatus = this.verifyTablesExist();
    const defaultDataStatus = this.verifyDefaultData();
    const unitConversions = this.verifyUnitConversions();

    const productCount = this.db.prepare('SELECT COUNT(*) as count FROM product').get()?.count || 0;
    const vendorCount = this.db.prepare('SELECT COUNT(*) as count FROM vendor').get()?.count || 0;
    const categoryCount = this.db.prepare('SELECT COUNT(*) as count FROM product_category').get()?.count || 0;

    return {
      tablesExist: tableStatus.all,
      defaultDataLoaded: defaultDataStatus.unitsOfMeasure && defaultDataStatus.productCategories && defaultDataStatus.defaultVendor,
      unitConversionsCorrect: Object.values(unitConversions).every(conv => conv.baseUnitCorrect && conv.factorCorrect),
      productCount: Number(productCount),
      vendorCount: Number(vendorCount),
      categoryCount: Number(categoryCount),
      tableStatus,
      defaultDataStatus,
      unitConversions,
    };
  }
}
