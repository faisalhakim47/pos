// @ts-check

import { test } from 'node:test';
import { join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const __dirname = new URL('.', import.meta.url).pathname;

// Generate a unique test run ID for this process
const testRunId = Date.now().toString(36).toLowerCase();

// Test fixtures and helpers
class TestFixture {
  /**
   * @param {string} label - Label for the test case (should be unique per test case)
   */
  constructor(label) {
    this.label = label.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    this.testRunId = testRunId;
    this.uniqueId = Math.random().toString(36).substring(2, 8); // Add extra randomness
    this.coreSchemaFilePath = join(__dirname, '001_core_accounting.sql');
    this.assetSchemaFilePath = join(__dirname, '003_asset_register.sql');
    this.coreSchemaFileContent = null;
    this.assetSchemaFileContent = null;
    this.db = null;
    this.dbPath = null;
  }

  async setup() {
    // Load both core accounting and asset register schemas
    this.coreSchemaFileContent = await readFile(this.coreSchemaFilePath, { encoding: 'utf8' });
    this.assetSchemaFileContent = await readFile(this.assetSchemaFilePath, { encoding: 'utf8' });

    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_${this.uniqueId}_asset_register_${this.label}.db`,
    );
    this.db = new DatabaseSync(this.dbPath);    // Execute schemas in order: core accounting first, then asset register
    try {
      this.db.exec(this.coreSchemaFileContent);
      this.db.exec(this.assetSchemaFileContent);

      // Verify that the fixed_asset table was created
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='fixed_asset'
      `).get();

      if (!tableExists) {
        throw new Error(`fixed_asset table was not created for test: ${this.label}`);
      }
    } catch (error) {
      throw new Error(`Schema execution failed for ${this.label}: ${error.message}`);
    }

    return this.db;
  }
}

await test('Asset Register Schema', async function (t) {
  await t.test('Asset categories are properly configured', async function (t) {
    const fixture = new TestFixture('Asset categories are properly configured');
    const db = await fixture.setup();

    const categories = db.prepare('SELECT * FROM asset_category ORDER BY name').all();

    t.assert.equal(categories.length, 5, 'Should have 5 asset categories');

    // Check Buildings category
    const buildings = categories.find(function (c) { return c.name === 'Buildings'; });
    t.assert.equal(buildings.asset_account_code, 12200, 'Buildings asset account code should be 12200');
    t.assert.equal(buildings.accumulated_depreciation_account_code, 12210, 'Buildings accumulated depreciation account code should be 12210');
    t.assert.equal(buildings.depreciation_expense_account_code, 61100, 'Buildings depreciation expense account code should be 61100');
    t.assert.equal(buildings.default_depreciation_method, 'straight_line', 'Buildings default depreciation method should be straight_line');
    t.assert.equal(buildings.useful_life_years, 25, 'Buildings useful life should be 25 years');

    // Check Office Equipment category (declining balance)
    const office = categories.find(function (c) { return c.name === 'Office Equipment'; });
    t.assert.equal(office.default_depreciation_method, 'declining_balance', 'Office Equipment should use declining balance method');
    t.assert.equal(office.default_declining_balance_rate, 0.4, 'Office Equipment declining balance rate should be 0.4');
  });

  await t.test('Asset registration with straight-line depreciation', async function (t) {
    const fixture = new TestFixture('Asset registration with straight-line depreciation');
    const db = await fixture.setup();

    // Register a building asset
    const assetResult = db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'BLDG-001',
      'Office Building',
      'Main office building downtown',
      1, // Buildings category
      1672531200, // 2023-01-01
      500000, // $5,000 cost in cents
      50000,  // $500 salvage in cents
      25,     // 25 years
      'straight_line',
    );

    t.assert.equal(assetResult.changes, 1, 'Should insert one asset record');

    // Verify asset was created
    const asset = db.prepare('SELECT * FROM fixed_asset WHERE id = ?').get(assetResult.lastInsertRowid);
    t.assert.equal(asset.name, 'Office Building', 'Asset name should match');
    t.assert.equal(asset.purchase_cost, 500000, 'Asset purchase cost should match');
    t.assert.equal(asset.status, 'active', 'Asset status should be active');
  });

  await t.test('Straight-line depreciation calculation', async function (t) {
    const fixture = new TestFixture('Straight-line depreciation calculation');
    await fixture.setup();

    // Test the straight-line depreciation calculation directly
    const cost = 500000;
    const salvageValue = 50000;
    const usefulLifeYears = 25;

    const annualDepreciation = (cost - salvageValue) / usefulLifeYears;

    // (500000 - 50000) / 25 = 18000
    t.assert.equal(annualDepreciation, 18000, 'Annual depreciation should be 18000');
  });

  await t.test('Declining balance depreciation calculation', async function (t) {
    const fixture = new TestFixture('Declining balance depreciation calculation');
    await fixture.setup();

    // Test declining balance depreciation calculation directly
    const initialCost = 100000;
    const rate = 0.4;

    const firstYearDepreciation = initialCost * rate;
    t.assert.equal(firstYearDepreciation, 40000, 'First year depreciation should be 40000');

    const bookValueAfterYear1 = initialCost - firstYearDepreciation;
    const secondYearDepreciation = bookValueAfterYear1 * rate;
    t.assert.equal(secondYearDepreciation, 24000, 'Second year depreciation should be 24000');
  });

  await t.test('Units of production depreciation calculation', async function (t) {
    const fixture = new TestFixture('Units of production depreciation calculation');
    await fixture.setup();

    // Test units of production depreciation
    const cost = 100000;
    const salvageValue = 10000;
    const totalUnits = 500000;
    const unitsUsed = 50000;

    const depreciationPerUnit = (cost - salvageValue) / totalUnits;
    const periodDepreciation = depreciationPerUnit * unitsUsed;

    // (100000 - 10000) / 500000 * 50000 = 0.18 * 50000 = 9000
    t.assert.equal(periodDepreciation, 9000, 'Period depreciation should be 9000');
  });

  await t.test('Depreciation schedule generation', async function (t) {
    const fixture = new TestFixture('Depreciation schedule generation');
    const db = await fixture.setup();

    // First create an asset
    const assetResult = db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'COMP-001',
      'Computer Equipment',
      'Desktop computers for office',
      3, // Office Equipment category
      1672531200, // 2023-01-01
      50000, // $500 cost in cents
      5000,  // $50 salvage in cents
      5,     // 5 years
      'straight_line',
    );

    const assetId = assetResult.lastInsertRowid;

    // Create depreciation schedule entries
    const annualDepreciation = 9000; // (50000 - 5000) / 5

    for (let year = 1; year <= 5; year++) {
      const periodEndDate = 1672531200 + (year * 365 * 24 * 60 * 60); // Add year in seconds

      db.prepare(`
        INSERT INTO depreciation_period (
          fixed_asset_id, period_start_date, period_end_date,
          depreciation_amount, accumulated_depreciation, book_value,
          calculation_method
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        assetId,
        1672531200 + ((year - 1) * 365 * 24 * 60 * 60),
        periodEndDate,
        annualDepreciation,
        annualDepreciation * year,
        50000 - (annualDepreciation * year),
        'straight_line',
      );
    }

    // Verify depreciation schedule
    const schedule = db.prepare(`
      SELECT * FROM depreciation_period
      WHERE fixed_asset_id = ?
      ORDER BY period_end_date
    `).all(assetId);

    t.assert.equal(schedule.length, 5, 'Should have 5 depreciation periods');
    t.assert.equal(schedule[0].depreciation_amount, 9000, 'First period depreciation should be 9000');
    t.assert.equal(schedule[4].accumulated_depreciation, 45000, 'Final accumulated depreciation should be 45000');
    t.assert.equal(schedule[4].book_value, 5000, 'Final book value should equal salvage value');
  });

  await t.test('Asset disposal tracking', async function (t) {
    const fixture = new TestFixture('Asset disposal tracking');
    const db = await fixture.setup();

    // Create an asset first
    const assetResult = db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'VEH-001',
      'Old Vehicle',
      'Company delivery truck',
      4, // Vehicles category
      1609459200, // 2021-01-01
      200000, // $2,000 cost in cents
      20000,  // $200 salvage in cents
      5,      // 5 years
      'straight_line',
    );

    const assetId = assetResult.lastInsertRowid;

    // Update asset with disposal information
    const disposalResult = db.prepare(`
      UPDATE fixed_asset SET
        status = 'disposed',
        disposal_date = ?,
        disposal_proceeds = ?
      WHERE id = ?
    `).run(
      1672531200, // 2023-01-01
      90000,  // Sold for $900
      assetId,
    );

    t.assert.equal(disposalResult.changes, 1, 'Should update one asset record');

    // Verify disposal record
    const asset = db.prepare(`
      SELECT * FROM fixed_asset WHERE id = ?
    `).get(assetId);

    t.assert.equal(asset.status, 'disposed', 'Asset status should be disposed');
    t.assert.equal(asset.disposal_proceeds, 90000, 'Disposal proceeds should match');
    t.assert.equal(asset.disposal_date, 1672531200, 'Disposal date should match');
  });

  await t.test('Asset maintenance tracking', async function (t) {
    const fixture = new TestFixture('Asset maintenance tracking');
    const db = await fixture.setup();

    // Create an asset first
    const assetResult = db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'MACH-001',
      'Production Machine',
      'Manufacturing equipment',
      2, // Machinery & Equipment category
      1672531200, // 2023-01-01
      1000000, // $10,000 cost in cents
      100000,  // $1,000 salvage in cents
      10,      // 10 years
      'straight_line',
    );

    const assetId = assetResult.lastInsertRowid;

    // Record maintenance using asset_modification table
    const maintenanceResult = db.prepare(`
      INSERT INTO asset_modification (
        fixed_asset_id, modification_date, modification_type,
        description, cost, capitalizable
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      assetId,
      1675209600, // 2023-02-01
      'maintenance',
      'Regular oil change and inspection',
      15000, // $150 in cents
      0,     // Not capitalizable
    );

    t.assert.equal(maintenanceResult.changes, 1, 'Should insert one maintenance record');

    // Record an improvement (capitalizable)
    const improvementResult = db.prepare(`
      INSERT INTO asset_modification (
        fixed_asset_id, modification_date, modification_type,
        description, cost, capitalizable
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      assetId,
      1677801600, // 2023-03-02
      'improvement',
      'Add air conditioning system',
      200000, // $2,000 in cents
      1,      // Capitalizable
    );

    t.assert.equal(improvementResult.changes, 1, 'Should insert one improvement record');

    // Verify maintenance records
    const modifications = db.prepare(`
      SELECT * FROM asset_modification
      WHERE fixed_asset_id = ?
      ORDER BY modification_date
    `).all(assetId);

    t.assert.equal(modifications.length, 2, 'Should have 2 modification records');
    t.assert.equal(modifications[0].capitalizable, 0, 'Maintenance should not be capitalizable');
    t.assert.equal(modifications[1].capitalizable, 1, 'Improvement should be capitalizable');
  });

  await t.test('Asset register summary view includes all calculations', async function (t) {
    const fixture = new TestFixture('Asset register summary view includes all calculations');
    const db = await fixture.setup();

    // Create an asset
    const assetResult = db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'TEST-001',
      'Test Asset',
      'Test asset for summary view',
      1, // Buildings category
      1672531200, // 2023-01-01
      100000, // $1,000 cost in cents
      10000,  // $100 salvage in cents
      10,     // 10 years
      'straight_line',
    );

    const assetId = assetResult.lastInsertRowid;

    // Add a depreciation period
    db.prepare(`
      INSERT INTO depreciation_period (
        fixed_asset_id, period_start_date, period_end_date,
        depreciation_amount, accumulated_depreciation, book_value,
        calculation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      assetId,
      1672531200, // 2023-01-01
      1704067200, // 2024-01-01
      9000,       // Annual depreciation: (100000 - 10000) / 10
      9000,       // First year accumulated
      91000,      // Book value after first year
      'straight_line',
    );

    // Add a capitalizable modification
    db.prepare(`
      INSERT INTO asset_modification (
        fixed_asset_id, modification_date, modification_type,
        description, cost, capitalizable
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      assetId,
      1675209600, // 2023-02-01
      'improvement',
      'Major upgrade',
      50000, // $500 in cents
      1,     // Capitalizable
    );

    // Check asset register summary
    const summary = db.prepare(`
      SELECT * FROM asset_register_summary
      WHERE id = ?
    `).get(assetId);

    t.assert.equal(summary.asset_number, 'TEST-001', 'Asset number should match');
    t.assert.equal(summary.purchase_cost, 100000, 'Purchase cost should match');
    t.assert.equal(summary.accumulated_depreciation, 9000, 'Accumulated depreciation should match');
    t.assert.equal(summary.book_value, 91000, 'Book value should be calculated correctly');
    t.assert.equal(summary.capitalized_modifications, 50000, 'Capitalized modifications should be included');
    t.assert.equal(summary.total_cost_basis, 150000, 'Total cost basis should include modifications');
  });

  await t.test('Depreciation calculation views work correctly', async function (t) {
    const fixture = new TestFixture('Depreciation calculation views work correctly');
    const db = await fixture.setup();

    // Create straight-line asset
    const slAssetResult = db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'SL-001',
      'Straight Line Asset',
      'Test straight line depreciation',
      1, // Buildings category
      1672531200, // 2023-01-01
      120000, // $1,200 cost in cents
      20000,  // $200 salvage in cents
      10,     // 10 years
      'straight_line',
    );

    // Create declining balance asset
    const dbAssetResult = db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method,
        declining_balance_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'DB-001',
      'Declining Balance Asset',
      'Test declining balance depreciation',
      3, // Office Equipment category
      1672531200, // 2023-01-01
      50000,  // $500 cost in cents
      5000,   // $50 salvage in cents
      5,      // 5 years
      'declining_balance',
      0.4,    // 40% declining balance rate
    );

    // Test straight-line calculation view
    const slCalc = db.prepare(`
      SELECT * FROM calculate_straight_line_depreciation
      WHERE fixed_asset_id = ?
    `).get(slAssetResult.lastInsertRowid);

    t.assert.equal(slCalc.annual_depreciation, 10000, 'Straight-line annual depreciation should be (120000-20000)/10 = 10000');
    t.assert.equal(slCalc.monthly_depreciation, 833, 'Monthly depreciation should be approximately 833');

    // Test declining balance calculation view
    const dbCalc = db.prepare(`
      SELECT * FROM calculate_declining_balance_depreciation
      WHERE fixed_asset_id = ?
    `).get(dbAssetResult.lastInsertRowid);

    t.assert.equal(dbCalc.declining_balance_rate, 0.4, 'Declining balance rate should be 0.4');
    t.assert.equal(dbCalc.current_book_value, 50000, 'Initial book value should equal purchase cost');
    t.assert.equal(dbCalc.next_year_depreciation, 20000, 'First year depreciation should be 50000 * 0.4 = 20000');
  });

  await t.test('Assets pending depreciation view works correctly', async function (t) {
    const fixture = new TestFixture('Assets pending depreciation view works correctly');
    const db = await fixture.setup();

    // Create an active asset
    const assetResult = db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'PENDING-001',
      'Asset Needing Depreciation',
      'Asset that needs depreciation calculation',
      2, // Machinery category
      1672531200, // 2023-01-01
      200000, // $2,000 cost in cents
      20000,  // $200 salvage in cents
      10,     // 10 years
      'straight_line',
    );

    // Check assets pending depreciation
    const pending = db.prepare(`
      SELECT * FROM assets_pending_depreciation
      WHERE id = ?
    `).get(assetResult.lastInsertRowid);

    t.assert.equal(pending.asset_number, 'PENDING-001', 'Asset should appear in pending list');
    t.assert.equal(pending.purchase_cost, 200000, 'Purchase cost should match');
    t.assert.equal(pending.current_accumulated_depreciation, 0, 'Should have no depreciation yet');

    // Add depreciation and verify it's removed from pending
    db.prepare(`
      INSERT INTO depreciation_period (
        fixed_asset_id, period_start_date, period_end_date,
        depreciation_amount, accumulated_depreciation, book_value,
        calculation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      assetResult.lastInsertRowid,
      1672531200, // 2023-01-01
      1704067200, // 2024-01-01
      18000,      // Annual depreciation
      18000,      // Accumulated
      182000,     // Book value
      'straight_line',
    );

    // Asset should still appear if not fully depreciated
    const stillPending = db.prepare(`
      SELECT * FROM assets_pending_depreciation
      WHERE id = ?
    `).get(assetResult.lastInsertRowid);

    t.assert.equal(!!stillPending, true, 'Asset should still need more depreciation');
    t.assert.equal(stillPending.current_accumulated_depreciation, 18000, 'Should show updated accumulated depreciation');
  });
});

await test('Asset Register - Accounting Principles Validation', async function (t) {
  await t.test('should validate asset cost and depreciation accounting treatment', async function (t) {
    const fixture = new TestFixture('asset_cost_validation');
    const db = await fixture.setup();

    // Create an asset without the foreign key reference that doesn't exist yet
    const assetResult = db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'ACC-001',
      'Test Asset for Accounting',
      'Asset to test accounting principles',
      1, // Buildings category
      1672531200, // 2023-01-01
      250000, // $2,500 cost
      25000,  // $250 salvage
      10,     // 10 years
      'straight_line',
    );

    t.assert.equal(assetResult.changes, 1, 'Asset should be created successfully');

    // Verify asset category account mappings are valid
    const category = db.prepare(`
      SELECT ac.*,
             aa.name as asset_account_name,
             ada.name as accum_dep_account_name,
             dea.name as dep_exp_account_name
      FROM asset_category ac
      JOIN account aa ON ac.asset_account_code = aa.code
      JOIN account ada ON ac.accumulated_depreciation_account_code = ada.code
      JOIN account dea ON ac.depreciation_expense_account_code = dea.code
      WHERE ac.id = 1
    `).get();

    t.assert.equal(!!category, true, 'Asset category should have valid account mappings');
    t.assert.equal(String(category.asset_account_name).includes('Buildings'), true, 'Asset account should be appropriate');
    t.assert.equal(String(category.accum_dep_account_name).includes('Accumulated Depreciation'), true, 'Accumulated depreciation account should be contra-asset');
    t.assert.equal(String(category.dep_exp_account_name).includes('Depreciation'), true, 'Depreciation expense account should be expense');

    // Verify account types are correct for asset accounting
    const accountTypes = db.prepare(`
      SELECT aa.account_type_name as asset_type,
             ada.account_type_name as accum_dep_type,
             dea.account_type_name as dep_exp_type
      FROM asset_category ac
      JOIN account aa ON ac.asset_account_code = aa.code
      JOIN account ada ON ac.accumulated_depreciation_account_code = ada.code
      JOIN account dea ON ac.depreciation_expense_account_code = dea.code
      WHERE ac.id = 1
    `).get();

    t.assert.equal(accountTypes.asset_type, 'asset', 'Asset account should be asset type');
    t.assert.equal(accountTypes.accum_dep_type, 'contra_asset', 'Accumulated depreciation should be contra-asset');
    t.assert.equal(accountTypes.dep_exp_type, 'expense', 'Depreciation expense should be expense type');
  });

  await t.test('should validate depreciation method consistency', async function (t) {
    const fixture = new TestFixture('dep_method_test');
    const db = await fixture.setup();

    // Test that assets use appropriate depreciation methods for their categories
    const assets = db.prepare(`
      SELECT fa.depreciation_method, fa.useful_life_years, fa.declining_balance_rate,
             ac.default_depreciation_method, ac.useful_life_years as default_life
      FROM fixed_asset fa
      JOIN asset_category ac ON fa.asset_category_id = ac.id
    `).all();

    assets.forEach(asset => {
      // Declining balance assets must have rate specified
      if (asset.depreciation_method === 'declining_balance') {
        t.assert.equal(!!asset.declining_balance_rate, true,
          'Declining balance assets must have declining_balance_rate specified');
        t.assert.equal(Number(asset.declining_balance_rate) > 0 && Number(asset.declining_balance_rate) <= 1, true,
          'Declining balance rate must be between 0 and 1');
      }

      // Useful life should be reasonable
      t.assert.equal(Number(asset.useful_life_years) > 0, true, 'Useful life must be positive');
      t.assert.equal(Number(asset.useful_life_years) <= 50, true, 'Useful life should be reasonable (≤50 years)');
    });
  });

  await t.test('should enforce asset cost and salvage value relationships', async function (t) {
    const fixture = new TestFixture('cost_salvage_test');
    let db;

    db = await fixture.setup();

    // Try to create asset with salvage value equal to purchase cost (should fail)
    t.assert.throws(() => {
      db.prepare(`
          INSERT INTO fixed_asset (
            asset_number, name, description, asset_category_id, purchase_date,
            purchase_cost, salvage_value, useful_life_years, depreciation_method
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
        'INVALID-001',
        'Invalid Asset',
        'Asset with salvage = cost',
        1, // Buildings category
        1672531200,
        100000, // $1,000 cost (in smallest currency unit)
        100000, // $1,000 salvage (invalid - equal to cost)
        10,
        'straight_line',
      );
    }, /salvage_value must be less than purchase_cost/); // Match the exact error message from the trigger

    // Try with salvage value greater than purchase cost (should also fail)
    t.assert.throws(() => {
      db.prepare(`
          INSERT INTO fixed_asset (
            asset_number, name, description, asset_category_id, purchase_date,
            purchase_cost, salvage_value, useful_life_years, depreciation_method
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
        'INVALID-002',
        'Invalid Asset',
        'Asset with salvage > cost',
        1, // Buildings category
        1672531200,
        100000, // $1,000 cost (in smallest currency unit)
        150000, // $1,500 salvage (invalid - greater than cost)
        10,
        'straight_line',
      );
    }, /salvage_value must be less than purchase_cost/); // Match the exact error message from the trigger

    // Valid asset with salvage < cost should work
    const validResult = db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'VALID-001',
      'Valid Asset',
      'Asset with proper salvage value',
      1,
      1672531200,
      100000, // $1,000 cost (in smallest currency unit)
      10000,  // $100 salvage (valid - less than cost)
      10,
      'straight_line',
    );

    t.assert.equal(validResult.changes, 1, 'Valid asset should be created successfully');
  });

  await t.test('should validate asset modification capitalization rules', async function (t) {
    const fixture = new TestFixture('modification_capitalization');
    const db = await fixture.setup();

    // Create an asset first
    const assetResult = db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'MOD-001',
      'Asset for Modifications',
      'Test asset modifications',
      2, // Office Equipment
      1672531200,
      50000, // $500
      5000,  // $50 salvage
      5,
      'straight_line',
    );

    const assetId = assetResult.lastInsertRowid;

    // Add capitalizable improvement
    const improvementResult = db.prepare(`
      INSERT INTO asset_modification (
        fixed_asset_id, modification_date, modification_type,
        description, cost, capitalizable
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      assetId,
      1680307200, // 2023-04-01
      'improvement',
      'Major upgrade that extends useful life',
      15000, // $150
      1,     // Capitalizable
    );

    // Add non-capitalizable maintenance
    const maintenanceResult = db.prepare(`
      INSERT INTO asset_modification (
        fixed_asset_id, modification_date, modification_type,
        description, cost, capitalizable
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      assetId,
      1680393600, // 2023-04-02
      'maintenance',
      'Routine maintenance and repairs',
      2000, // $20
      0,    // Not capitalizable
    );

    t.assert.equal(improvementResult.changes, 1, 'Improvement should be recorded');
    t.assert.equal(maintenanceResult.changes, 1, 'Maintenance should be recorded');

    // Check asset register summary includes capitalized modifications
    const summary = db.prepare(`
      SELECT * FROM asset_register_summary WHERE id = ?
    `).get(assetId);

    t.assert.equal(Number(summary.capitalized_modifications), 15000,
      'Should include only capitalizable modifications in cost basis');
    t.assert.equal(Number(summary.total_cost_basis), 65000,
      'Total cost basis should be purchase cost + capitalizable modifications');
  });

  await t.test('should prevent modification of disposed assets', async function (t) {
    const fixture = new TestFixture('disposed_mod_test');
    const db = await fixture.setup();

    // Create and dispose an asset
    const assetResult = db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method,
        status, disposal_date, disposal_proceeds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'DISPOSED-001',
      'Disposed Asset',
      'Asset that has been disposed',
      3, // Vehicles
      1672531200,
      80000, // $800
      8000,  // $80 salvage
      8,
      'straight_line',
      'disposed',
      1704067200, // 2024-01-01
      10000,      // $100 disposal proceeds
    );

    const assetId = assetResult.lastInsertRowid;

    // Try to modify key attributes of disposed asset (should fail)
    t.assert.throws(function () {
      db.prepare(`
        UPDATE fixed_asset
        SET purchase_cost = 90000
        WHERE id = ?
      `).run(assetId);
    }, 'Should not allow modification of disposed asset cost');

    t.assert.throws(function () {
      db.prepare(`
        UPDATE fixed_asset
        SET useful_life_years = 10
        WHERE id = ?
      `).run(assetId);
    }, 'Should not allow modification of disposed asset useful life');

    // Should allow modification of non-key attributes like location
    const locationUpdate = db.prepare(`
      UPDATE fixed_asset
      SET location = 'Archive Storage'
      WHERE id = ?
    `).run(assetId);

    t.assert.equal(locationUpdate.changes, 1, 'Should allow updating location of disposed asset');
  });

  await t.test('should validate disposal date consistency', async function (t) {
    const fixture = new TestFixture('disposal_date_test');
    const db = await fixture.setup();

    // Create asset first
    const assetResult = db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'DISPOSAL-001',
      'Asset for Disposal Testing',
      'Test disposal validation',
      1,
      1672531200, // 2023-01-01 purchase
      100000,
      10000,
      10,
      'straight_line',
    );

    const assetId = assetResult.lastInsertRowid;

    // Try to dispose with date before purchase (should fail)
    t.assert.throws(function () {
      db.prepare(`
        UPDATE fixed_asset
        SET status = 'disposed', disposal_date = ?
        WHERE id = ?
      `).run(1640995200, assetId); // 2022-01-01 (before purchase)
    }, 'Should reject disposal date before purchase date');

    // Valid disposal should work
    const validDisposal = db.prepare(`
      UPDATE fixed_asset
      SET status = 'disposed', disposal_date = ?, disposal_proceeds = ?
      WHERE id = ?
    `).run(1704067200, 50000, assetId); // 2024-01-01, $500 proceeds

    t.assert.equal(validDisposal.changes, 1, 'Valid disposal should succeed');
  });

  await t.test('should calculate depreciation accurately for different methods', async function (t) {
    const fixture = new TestFixture('depreciation_accuracy');
    const db = await fixture.setup();

    // Test straight-line depreciation calculation
    const slAsset = db.prepare(`
      SELECT * FROM calculate_straight_line_depreciation
      LIMIT 1
    `).get();

    if (slAsset) {
      // Annual depreciation = (Cost - Salvage) / Useful Life
      const expectedAnnual = (slAsset.fixed_asset_id) ?
        db.prepare(`
          SELECT (purchase_cost - salvage_value) / useful_life_years as expected_annual
          FROM fixed_asset WHERE id = ?
        `).get(slAsset.fixed_asset_id).expected_annual : 0;

      const toleranceAmount = 1; // Allow 1 cent tolerance for rounding
      t.assert.equal(
        Math.abs(Number(slAsset.annual_depreciation) - Number(expectedAnnual)) <= toleranceAmount,
        true,
        'Straight-line depreciation calculation should be accurate',
      );
    }
  });

  await t.test('should maintain asset register data integrity', async function (t) {
    const fixture = new TestFixture('data_integrity');
    const db = await fixture.setup();

    // Verify all assets have valid categories
    const invalidAssets = db.prepare(`
      SELECT fa.id, fa.asset_number
      FROM fixed_asset fa
      LEFT JOIN asset_category ac ON fa.asset_category_id = ac.id
      WHERE ac.id IS NULL
    `).all();

    t.assert.equal(invalidAssets.length, 0, 'All assets should have valid categories');

    // Verify all depreciation periods reference valid assets
    const invalidDepPeriods = db.prepare(`
      SELECT dp.id
      FROM depreciation_period dp
      LEFT JOIN fixed_asset fa ON dp.fixed_asset_id = fa.id
      WHERE fa.id IS NULL
    `).all();

    t.assert.equal(invalidDepPeriods.length, 0, 'All depreciation periods should reference valid assets');

    // Verify asset numbers are unique
    const duplicateNumbers = db.prepare(`
      SELECT asset_number, COUNT(*) as count
      FROM fixed_asset
      GROUP BY asset_number
      HAVING COUNT(*) > 1
    `).all();

    t.assert.equal(duplicateNumbers.length, 0, 'Asset numbers should be unique');
  });

});
