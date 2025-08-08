// @ts-check

import { test } from 'node:test';

import { ProductManagementTestFixture } from './test-utils/product-management-test-fixture.js';

test('Product Management Schema Structure', async function (t) {

  await t.test('Schema initialization', async function (t) {
    const fixture = new ProductManagementTestFixture('schema_initialization');
    await fixture.setup();

    const tableStatus = fixture.verifyTablesExist();
    t.assert.equal(tableStatus.all, true, 'All product management tables should exist');
    t.assert.equal(tableStatus.missing.length, 0, 'No tables should be missing');

    fixture.cleanup();
  });

  await t.test('Default data population', async function (t) {
    const fixture = new ProductManagementTestFixture('default_data_population');
    await fixture.setup();

    const defaultDataStatus = fixture.verifyDefaultData();
    t.assert.equal(defaultDataStatus.unitsOfMeasure, true, 'Units of measure should be populated');
    t.assert.equal(defaultDataStatus.productCategories, true, 'Product categories should be populated');
    t.assert.equal(defaultDataStatus.defaultVendor, true, 'Default vendor should exist');
    t.assert.equal(defaultDataStatus.unitsCount > 0, true, 'Should have multiple units of measure');
    t.assert.equal(defaultDataStatus.categoriesCount > 0, true, 'Should have multiple product categories');

    fixture.cleanup();
  });

  await t.test('Unit of measure conversions', async function (t) {
    const fixture = new ProductManagementTestFixture('unit_conversions');
    await fixture.setup();

    const conversions = fixture.verifyUnitConversions();

    // Test specific conversion factors
    t.assert.equal(conversions.G?.baseUnitCorrect, true, 'Gram should have KG as base unit');
    t.assert.equal(conversions.G?.factorCorrect, true, 'Gram conversion factor should be 0.001');

    t.assert.equal(conversions.LB?.baseUnitCorrect, true, 'Pound should have KG as base unit');
    t.assert.equal(conversions.LB?.factorCorrect, true, 'Pound conversion factor should be 0.453592');

    t.assert.equal(conversions.ML?.baseUnitCorrect, true, 'Milliliter should have L as base unit');
    t.assert.equal(conversions.ML?.factorCorrect, true, 'Milliliter conversion factor should be 0.001');

    fixture.cleanup();
  });

  await t.test('Account integration validation', async function (t) {
    const fixture = new ProductManagementTestFixture('account_integration');
    await fixture.setup();

    // Verify key accounting accounts exist for inventory integration
    const inventoryAccount = fixture.db.prepare('SELECT * FROM account WHERE code = 10300').get();
    t.assert.equal(!!inventoryAccount, true, 'Inventory account (10300) should exist');
    t.assert.equal(String(inventoryAccount?.name), 'Inventory', 'Inventory account name should match');

    const cogsAccount = fixture.db.prepare('SELECT * FROM account WHERE code = 50100').get();
    t.assert.equal(!!cogsAccount, true, 'COGS account (50100) should exist');
    t.assert.equal(String(cogsAccount?.name), 'Cost of Goods Sold', 'COGS account name should match');

    const salesAccount = fixture.db.prepare('SELECT * FROM account WHERE code = 40100').get();
    t.assert.equal(!!salesAccount, true, 'Sales account (40100) should exist');
    t.assert.equal(String(salesAccount?.name), 'Sales Revenue', 'Sales account name should match');

    fixture.cleanup();
  });
});

test('Product Catalog Management', async function (t) {

  await t.test('Product category creation and hierarchy', async function (t) {
    const fixture = new ProductManagementTestFixture('category_hierarchy');
    await fixture.setup();

    // Create parent category
    const parentId = fixture.createProductCategory('PARENT', 'Parent Category', 'Parent category for testing');
    t.assert.equal(typeof parentId, 'number', 'Parent category should be created');

    // Create child category
    const childId = fixture.createProductCategory('CHILD', 'Child Category', 'Child category for testing', parentId);
    t.assert.equal(typeof childId, 'number', 'Child category should be created');

    // Verify hierarchy
    const child = fixture.db.prepare('SELECT * FROM product_category WHERE id = ?').get(childId);
    t.assert.equal(!!child, true, 'Child category should exist');
    t.assert.equal(Number(child?.parent_category_id), parentId, 'Child should reference parent');

    // Test hierarchical query
    const hierarchy = fixture.db.prepare(`
      SELECT c.name as child_name, p.name as parent_name
      FROM product_category c
      LEFT JOIN product_category p ON p.id = c.parent_category_id
      WHERE c.id = ?
    `).get(childId);

    t.assert.equal(String(hierarchy?.child_name), 'Child Category', 'Child name should match');
    t.assert.equal(String(hierarchy?.parent_name), 'Parent Category', 'Parent name should match');

    fixture.cleanup();
  });

  await t.test('Product creation with category assignment', async function (t) {
    const fixture = new ProductManagementTestFixture('product_creation');
    await fixture.setup();

    // Create category first
    const categoryId = fixture.createProductCategory('ELECTRONICS', 'Electronics', 'Electronic products');

    // Create product
    const productId = fixture.createProduct({
      sku: 'LAPTOP-001',
      name: 'Business Laptop',
      description: 'High-performance business laptop',
      productCategoryId: categoryId,
      standardCost: 50000, // $500.00
      costingMethod: 'STANDARD_COST',
    });

    t.assert.equal(typeof productId, 'number', 'Product should be created');

    // Verify product details
    const product = fixture.getProduct(productId);
    t.assert.equal(!!product, true, 'Product should exist');
    t.assert.equal(String(product?.sku), 'LAPTOP-001', 'Product SKU should match');
    t.assert.equal(String(product?.name), 'Business Laptop', 'Product name should match');
    t.assert.equal(Number(product?.standard_cost), 50000, 'Standard cost should match');
    t.assert.equal(String(product?.costing_method), 'STANDARD_COST', 'Costing method should match');
    t.assert.equal(String(product?.category_name), 'Electronics', 'Category name should be included');

    fixture.cleanup();
  });

  await t.test('Product variant management', async function (t) {
    const fixture = new ProductManagementTestFixture('product_variants');
    await fixture.setup();

    // Create base product
    const productId = fixture.createProduct({
      sku: 'SHIRT-BASE',
      name: 'T-Shirt',
      description: 'Basic t-shirt with variants',
      standardCost: 1500, // $15.00
    });

    // Create variants
    const redLargeId = fixture.createProductVariant({
      productId,
      sku: 'SHIRT-RED-L',
      name: 'Red T-Shirt Large',
      variantAttributes: JSON.stringify({ color: 'red', size: 'L' }),
      standardCost: 1600,
    });

    const blueMediumId = fixture.createProductVariant({
      productId,
      sku: 'SHIRT-BLUE-M',
      name: 'Blue T-Shirt Medium',
      variantAttributes: JSON.stringify({ color: 'blue', size: 'M' }),
      standardCost: 1550,
    });

    t.assert.equal(typeof redLargeId, 'number', 'Red large variant should be created');
    t.assert.equal(typeof blueMediumId, 'number', 'Blue medium variant should be created');

    // Get all variants for the product
    const variants = fixture.getProductVariants(productId);
    t.assert.equal(variants.length, 2, 'Should have 2 variants');

    const redVariant = variants.find(v => v.sku === 'SHIRT-RED-L');
    const blueVariant = variants.find(v => v.sku === 'SHIRT-BLUE-M');

    t.assert.equal(!!redVariant, true, 'Red variant should exist');
    t.assert.equal(!!blueVariant, true, 'Blue variant should exist');
    t.assert.equal(String(redVariant?.name), 'Red T-Shirt Large', 'Red variant name should match');
    t.assert.equal(Number(redVariant?.standard_cost), 1600, 'Red variant cost should match');

    fixture.cleanup();
  });

  await t.test('Product data integrity constraints', async function (t) {
    const fixture = new ProductManagementTestFixture('data_integrity');
    await fixture.setup();

    const categoryId = fixture.createProductCategory('TEST', 'Test Category');

    // Create first product
    fixture.createProduct({
      sku: 'UNIQUE-001',
      name: 'First Product',
      productCategoryId: categoryId,
    });

    // Test unique SKU constraint
    t.assert.throws(function () {
      fixture.createProduct({
        sku: 'UNIQUE-001', // Duplicate SKU
        name: 'Second Product',
        productCategoryId: categoryId,
      });
    }, 'Should throw error for duplicate SKU');

    // Test negative standard cost constraint
    t.assert.throws(function () {
      fixture.createProduct({
        sku: 'NEGATIVE-COST',
        name: 'Negative Cost Product',
        productCategoryId: categoryId,
        standardCost: -100,
      });
    }, 'Should throw error for negative standard cost');

    fixture.cleanup();
  });
});

test('Vendor Management', async function (t) {

  await t.test('Vendor creation and management', async function (t) {
    const fixture = new ProductManagementTestFixture('vendor_creation');
    await fixture.setup();

    const vendorId = fixture.createVendor({
      vendorCode: 'ACME-001',
      name: 'ACME Corporation',
      contactPerson: 'Jane Smith',
      email: 'jane@acme.com',
      phone: '+1-555-0199',
      paymentTermsDays: 45,
    });

    t.assert.equal(typeof vendorId, 'number', 'Vendor should be created');

    // Verify vendor details
    const vendor = fixture.db.prepare('SELECT * FROM vendor WHERE id = ?').get(vendorId);
    t.assert.equal(!!vendor, true, 'Vendor should exist');
    t.assert.equal(String(vendor?.vendor_code), 'ACME-001', 'Vendor code should match');
    t.assert.equal(String(vendor?.name), 'ACME Corporation', 'Vendor name should match');
    t.assert.equal(String(vendor?.contact_person), 'Jane Smith', 'Contact person should match');
    t.assert.equal(Number(vendor?.payment_terms_days), 45, 'Payment terms should match');

    fixture.cleanup();
  });

  await t.test('Vendor-product relationship management', async function (t) {
    const fixture = new ProductManagementTestFixture('vendor_product_relationships');
    await fixture.setup();

    // Create vendor and product
    const vendorId = fixture.createVendor({
      vendorCode: 'SUPPLIER-002',
      name: 'Quality Supplier Inc.',
    });

    const productId = fixture.createProduct({
      sku: 'WIDGET-001',
      name: 'Premium Widget',
    });

    // Create vendor-product relationship
    const vendorProductId = fixture.createVendorProduct({
      vendorId,
      productId,
      vendorSku: 'QUAL-WIDGET-001',
      vendorName: 'Premium Quality Widget',
      unitPrice: 2500, // $25.00
      minimumOrderQuantity: 50,
      leadTimeDays: 14,
      isPreferred: 1,
    });

    t.assert.equal(typeof vendorProductId, 'number', 'Vendor-product relationship should be created');

    // Get vendor-product details
    const vendorProducts = fixture.getVendorProducts(vendorId, productId);
    t.assert.equal(vendorProducts.length, 1, 'Should have one vendor-product relationship');

    const vp = vendorProducts[0];
    t.assert.equal(String(vp?.vendor_name), 'Quality Supplier Inc.', 'Vendor name should match');
    t.assert.equal(String(vp?.product_sku), 'WIDGET-001', 'Product SKU should match');
    t.assert.equal(String(vp?.vendor_sku), 'QUAL-WIDGET-001', 'Vendor SKU should match');
    t.assert.equal(Number(vp?.unit_price), 2500, 'Unit price should match');
    t.assert.equal(Number(vp?.minimum_order_quantity), 50, 'MOQ should match');
    t.assert.equal(Number(vp?.lead_time_days), 14, 'Lead time should match');
    t.assert.equal(Number(vp?.is_preferred), 1, 'Should be preferred vendor');

    fixture.cleanup();
  });

  await t.test('Multiple vendors per product scenario', async function (t) {
    const fixture = new ProductManagementTestFixture('multiple_vendors');
    await fixture.setup();

    // Create product
    const productId = fixture.createProduct({
      sku: 'MULTI-VENDOR-001',
      name: 'Multi-Vendor Product',
    });

    // Create multiple vendors
    const vendor1Id = fixture.createVendor({
      vendorCode: 'VEN-001',
      name: 'Primary Vendor',
    });

    const vendor2Id = fixture.createVendor({
      vendorCode: 'VEN-002',
      name: 'Secondary Vendor',
    });

    const vendor3Id = fixture.createVendor({
      vendorCode: 'VEN-003',
      name: 'Backup Vendor',
    });

    // Create vendor-product relationships
    fixture.createVendorProduct({
      vendorId: vendor1Id,
      productId,
      unitPrice: 2000,
      isPreferred: 1,
      leadTimeDays: 5,
    });

    fixture.createVendorProduct({
      vendorId: vendor2Id,
      productId,
      unitPrice: 2200,
      isPreferred: 0,
      leadTimeDays: 7,
    });

    fixture.createVendorProduct({
      vendorId: vendor3Id,
      productId,
      unitPrice: 2500,
      isPreferred: 0,
      leadTimeDays: 14,
    });

    // Get all vendors for the product
    const vendorProducts = fixture.getVendorProducts(undefined, productId);
    t.assert.equal(vendorProducts.length, 3, 'Should have 3 vendor-product relationships');

    // Check preferred vendor
    const preferredVendors = vendorProducts.filter(vp => vp.is_preferred === 1);
    t.assert.equal(preferredVendors.length, 1, 'Should have exactly one preferred vendor');
    t.assert.equal(String(preferredVendors[0]?.vendor_name), 'Primary Vendor', 'Preferred vendor should be Primary Vendor');

    fixture.cleanup();
  });

  await t.test('Vendor data integrity constraints', async function (t) {
    const fixture = new ProductManagementTestFixture('vendor_integrity');
    await fixture.setup();

    // Create vendor and product
    const vendorId = fixture.createVendor({
      vendorCode: 'INTEGRITY-VEN',
      name: 'Integrity Vendor',
    });

    const productId = fixture.createProduct({
      sku: 'INTEGRITY-PROD',
      name: 'Integrity Product',
    });

    // Create vendor-product relationship
    fixture.createVendorProduct({
      vendorId,
      productId,
      unitPrice: 1000,
    });

    // Test unique vendor-product constraint
    t.assert.throws(function () {
      fixture.createVendorProduct({
        vendorId,
        productId, // Same vendor-product combination
        unitPrice: 1500,
      });
    }, 'Should throw error for duplicate vendor-product relationship');

    fixture.cleanup();
  });
});

test('Product Management Integration', async function (t) {

  await t.test('Complete product scenario creation', async function (t) {
    const fixture = new ProductManagementTestFixture('complete_scenario');
    await fixture.setup();

    const scenario = fixture.createProductScenario({
      categoryCode: 'ELECTRONICS',
      categoryName: 'Electronics & Gadgets',
      productSku: 'SMARTPHONE-001',
      productName: 'Premium Smartphone',
      vendorCode: 'TECH-SUPPLIER',
      vendorName: 'Tech Supplier Ltd.',
      variantCount: 3,
    });

    t.assert.equal(typeof scenario.categoryId, 'number', 'Category should be created');
    t.assert.equal(typeof scenario.productId, 'number', 'Product should be created');
    t.assert.equal(typeof scenario.vendorId, 'number', 'Vendor should be created');
    t.assert.equal(typeof scenario.vendorProductId, 'number', 'Vendor-product relationship should be created');
    t.assert.equal(scenario.variants.length, 3, 'Should have 3 variants');

    // Verify relationships
    const product = fixture.getProduct(scenario.productId);
    t.assert.equal(String(product?.sku), 'SMARTPHONE-001', 'Product SKU should match');
    t.assert.equal(String(product?.category_name), 'Electronics & Gadgets', 'Category should be linked');

    const variants = fixture.getProductVariants(scenario.productId);
    t.assert.equal(variants.length, 3, 'Should have 3 variants created');

    const vendorProducts = fixture.getVendorProducts(scenario.vendorId, scenario.productId);
    t.assert.equal(vendorProducts.length, 1, 'Should have vendor-product relationship');
    t.assert.equal(Number(vendorProducts[0]?.is_preferred), 1, 'Should be preferred vendor');

    fixture.cleanup();
  });

  await t.test('Product management integrity validation', async function (t) {
    const fixture = new ProductManagementTestFixture('integrity_validation');
    await fixture.setup();

    // Create some test data
    fixture.createProductScenario();

    const integrity = fixture.validateProductManagementIntegrity();
    t.assert.equal(integrity.tablesExist, true, 'All tables should exist');
    t.assert.equal(integrity.defaultDataLoaded, true, 'Default data should be loaded');
    t.assert.equal(integrity.unitConversionsCorrect, true, 'Unit conversions should be correct');
    t.assert.equal(integrity.productCount > 0, true, 'Should have products');
    t.assert.equal(integrity.vendorCount > 0, true, 'Should have vendors');
    t.assert.equal(integrity.categoryCount > 0, true, 'Should have categories');

    fixture.cleanup();
  });

  await t.test('Product catalog with accounting integration', async function (t) {
    const fixture = new ProductManagementTestFixture('accounting_integration');
    await fixture.setupWithInitialCapital();

    // Create product with specific account codes
    const productId = fixture.createProduct({
      sku: 'ACCOUNTING-001',
      name: 'Accounting Integration Product',
      standardCost: 3000,
      inventoryAccountCode: 10300, // Inventory
      cogsAccountCode: 50100,      // Cost of Goods Sold
      salesAccountCode: 40100,     // Sales Revenue
    });

    const product = fixture.getProduct(productId);
    t.assert.equal(Number(product?.inventory_account_code), 10300, 'Inventory account should be correct');
    t.assert.equal(Number(product?.cogs_account_code), 50100, 'COGS account should be correct');
    t.assert.equal(Number(product?.sales_account_code), 40100, 'Sales account should be correct');

    // Verify account integration works
    const inventoryAccount = fixture.db.prepare('SELECT * FROM account WHERE code = ?').get(10300);
    const cogsAccount = fixture.db.prepare('SELECT * FROM account WHERE code = ?').get(50100);
    const salesAccount = fixture.db.prepare('SELECT * FROM account WHERE code = ?').get(40100);

    t.assert.equal(!!inventoryAccount, true, 'Inventory account should exist');
    t.assert.equal(!!cogsAccount, true, 'COGS account should exist');
    t.assert.equal(!!salesAccount, true, 'Sales account should exist');

    // Verify accounting integrity still holds
    const accountingIntegrity = fixture.validateAccountingIntegrity();
    t.assert.equal(accountingIntegrity.accountingEquation, true, 'Accounting equation should be satisfied');
    t.assert.equal(accountingIntegrity.trialBalance, true, 'Trial balance should be satisfied');

    fixture.cleanup();
  });

  await t.test('Default vendor functionality', async function (t) {
    const fixture = new ProductManagementTestFixture('default_vendor');
    await fixture.setup();

    // Verify default vendor exists
    const defaultVendor = fixture.db.prepare('SELECT * FROM vendor WHERE vendor_code = ?').get('SUPPLIER001');
    t.assert.equal(!!defaultVendor, true, 'Default vendor should exist');
    t.assert.equal(String(defaultVendor?.name), 'Default Supplier', 'Default vendor name should match');
    t.assert.equal(String(defaultVendor?.contact_person), 'John Smith', 'Contact person should match');
    t.assert.equal(Number(defaultVendor?.payment_terms_days), 30, 'Payment terms should be 30 days');

    // Test using default vendor in relationships
    const productId = fixture.createProduct({
      sku: 'DEFAULT-VEN-PROD',
      name: 'Default Vendor Product',
    });

    fixture.createVendorProduct({
      vendorId: Number(defaultVendor?.id),
      productId,
      unitPrice: 1000,
    });

    const vendorProducts = fixture.getVendorProducts(Number(defaultVendor?.id));
    t.assert.equal(vendorProducts.length, 1, 'Should have one product for default vendor');
    t.assert.equal(String(vendorProducts[0]?.vendor_name), 'Default Supplier', 'Vendor name should match');

    fixture.cleanup();
  });

  await t.test('Product management with foreign key constraints', async function (t) {
    const fixture = new ProductManagementTestFixture('foreign_key_constraints');
    await fixture.setup();

    // Test foreign key constraint on non-existent category
    t.assert.throws(function () {
      fixture.createProduct({
        sku: 'FK-TEST-001',
        name: 'Foreign Key Test Product',
        productCategoryId: 99999, // Non-existent category
      });
    }, 'Should throw error for non-existent category reference');

    // Test foreign key constraint on non-existent account
    t.assert.throws(function () {
      fixture.createProduct({
        sku: 'FK-TEST-002',
        name: 'Foreign Key Test Product 2',
        inventoryAccountCode: 99999, // Non-existent account
      });
    }, 'Should throw error for non-existent inventory account reference');

    fixture.cleanup();
  });
});
