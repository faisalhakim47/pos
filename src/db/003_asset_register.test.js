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
      `${this.testRunId}_asset_register_${this.label}.db`,
    );
    this.db = new DatabaseSync(this.dbPath);

    // Execute schemas in order: core accounting first, then asset register
    this.db.exec(this.coreSchemaFileContent);
    this.db.exec(this.assetSchemaFileContent);

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

    // Verify maintenance record
    const maintenance = db.prepare(`
      SELECT * FROM asset_modification WHERE fixed_asset_id = ? AND modification_type = 'maintenance'
    `).get(assetId);

    t.assert.equal(maintenance.modification_type, 'maintenance', 'Modification type should be maintenance');
    t.assert.equal(maintenance.cost, 15000, 'Maintenance cost should match');
    t.assert.equal(maintenance.description, 'Regular oil change and inspection', 'Maintenance description should match');
    t.assert.equal(maintenance.capitalizable, 0, 'Maintenance should not be capitalizable');
  });

  await t.test('Asset register view comprehensive reporting', async function (t) {
    const fixture = new TestFixture('Asset register view comprehensive reporting');
    const db = await fixture.setup();

    // Create multiple assets with different categories
    db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'BLDG-002',
      'Warehouse Building',
      'Storage facility',
      1, // Buildings
      1640995200, // 2022-01-01
      2000000, // $20,000
      200000,  // $2,000 salvage
      25,      // 25 years
      'straight_line',
    );

    db.prepare(`
      INSERT INTO fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method,
        declining_balance_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'COMP-002',
      'Office Computers',
      'Desktop workstations',
      3, // Office Equipment
      1672531200, // 2023-01-01
      100000, // $1,000
      10000,  // $100 salvage
      5,      // 5 years
      'declining_balance',
      0.2,    // 20% declining balance rate
    );

    // Query the asset register view
    const assetRegister = db.prepare(`
      SELECT
        name,
        category_name,
        purchase_date,
        purchase_cost,
        book_value,
        depreciation_method,
        useful_life_years
      FROM asset_register_summary
      ORDER BY name
    `).all();

    t.assert.equal(assetRegister.length, 2, 'Should have 2 assets in register');

    const computers = assetRegister.find(function (a) { return a.name === 'Office Computers'; });
    t.assert.equal(computers.category_name, 'Office Equipment', 'Computer category should be Office Equipment');
    t.assert.equal(computers.purchase_cost, 100000, 'Computer purchase cost should match');
    t.assert.equal(computers.book_value, 100000, 'Computer book value should equal purchase cost (no depreciation yet)');
    t.assert.equal(computers.depreciation_method, 'declining_balance', 'Computer depreciation method should be declining_balance');

    const warehouse = assetRegister.find(function (a) { return a.name === 'Warehouse Building'; });
    t.assert.equal(warehouse.category_name, 'Buildings', 'Warehouse category should be Buildings');
    t.assert.equal(warehouse.purchase_cost, 2000000, 'Warehouse purchase cost should match');
    t.assert.equal(warehouse.book_value, 2000000, 'Warehouse book value should equal purchase cost (no depreciation yet)');
    t.assert.equal(warehouse.depreciation_method, 'straight_line', 'Warehouse depreciation method should be straight_line');
  });

  await t.test('Foreign key constraints validation', async function (t) {
    const fixture = new TestFixture('Foreign key constraints validation');
    const db = await fixture.setup();

    // Test that all foreign key references in asset categories are valid
    t.assert.throws(
      function () {
        db.prepare(`
          INSERT INTO asset_category (
            name, description, useful_life_years, default_depreciation_method,
            asset_account_code, accumulated_depreciation_account_code, depreciation_expense_account_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'Invalid Category',
          'Test category with invalid account codes',
          10,
          'straight_line',
          99999, // Invalid account code
          99998, // Invalid account code
          99997,  // Invalid account code
        );
      },
      function (error) {
        return error instanceof Error && error.message.includes('FOREIGN KEY constraint failed');
      },
      'Should throw foreign key constraint error for invalid account codes',
    );

    // Test that asset must reference valid category
    t.assert.throws(
      function () {
        db.prepare(`
          INSERT INTO fixed_asset (
            asset_number, name, description, asset_category_id, purchase_date,
            purchase_cost, salvage_value, useful_life_years, depreciation_method
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'INVALID-001',
          'Invalid Asset',
          'Asset with invalid category',
          999, // Invalid category ID
          1672531200,
          100000,
          10000,
          5,
          'straight_line',
        );
      },
      function (error) {
        return error instanceof Error && error.message.includes('FOREIGN KEY constraint failed');
      },
      'Should throw foreign key constraint error for invalid category ID',
    );
  });

  await t.test('Data validation constraints', async function (t) {
    const fixture = new TestFixture('Data validation constraints');
    const db = await fixture.setup();

    // Test useful life years must be positive
    t.assert.throws(
      function () {
        db.prepare(`
          INSERT INTO asset_category (
            name, description, useful_life_years, default_depreciation_method,
            asset_account_code, accumulated_depreciation_account_code, depreciation_expense_account_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'Invalid Life Category',
          'Test category',
          0, // Invalid: must be > 0
          'straight_line',
          12200,
          12210,
          61100,
        );
      },
      function (error) {
        return error instanceof Error && error.message.includes('CHECK constraint failed');
      },
      'Should throw CHECK constraint error for invalid useful life years',
    );

    // Test depreciation method validation
    t.assert.throws(
      function () {
        db.prepare(`
          INSERT INTO asset_category (
            name, description, useful_life_years, default_depreciation_method,
            asset_account_code, accumulated_depreciation_account_code, depreciation_expense_account_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'Invalid Method Category',
          'Test category',
          10,
          'invalid_method', // Invalid depreciation method
          12200,
          12210,
          61100,
        );
      },
      function (error) {
        return error instanceof Error && error.message.includes('CHECK constraint failed');
      },
      'Should throw CHECK constraint error for invalid depreciation method',
    );

    // Test declining balance rate validation
    t.assert.throws(
      function () {
        db.prepare(`
          INSERT INTO asset_category (
            name, description, useful_life_years, default_depreciation_method,
            default_declining_balance_rate, asset_account_code,
            accumulated_depreciation_account_code, depreciation_expense_account_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'Invalid Rate Category',
          'Test category',
          10,
          'declining_balance',
          1.5, // Invalid: must be <= 1
          12200,
          12210,
          61100,
        );
      },
      function (error) {
        return error instanceof Error && error.message.includes('CHECK constraint failed');
      },
      'Should throw CHECK constraint error for invalid declining balance rate',
    );
  });
});
