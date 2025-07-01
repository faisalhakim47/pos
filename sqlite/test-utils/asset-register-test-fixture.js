// @ts-check

import { join } from 'node:path';

import { CoreAccountingTestFixture } from './core-accounting-test-fixture.js';

/** @typedef {import('node:sqlite').DatabaseSync} DatabaseSync */

const __dirname = new URL('.', import.meta.url).pathname;

/**
 * Asset Register Test Fixture
 *
 * Extends CoreAccountingTestFixture to provide asset management specific testing utilities.
 * Includes functionality for fixed asset creation, depreciation calculations,
 * asset modifications, disposal tracking, and comprehensive asset lifecycle testing.
 */
export class AssetRegisterTestFixture extends CoreAccountingTestFixture {
  /**
   * @param {string} label - Label for the test case (should be unique per test case)
   */
  constructor(label) {
    super(label);
    this.assetSchemaPath = join(__dirname, '../003_asset_register.sql');
  }

  /**
   * Sets up the database with core accounting and asset register schemas
   * @returns {Promise<DatabaseSync>} The initialized database
   */
  async setup() {
    await this.setupWithAdditionalSchemas([this.assetSchemaPath]);
    return this.db;
  }

  /**
   * Sets up the database with initial capital and standard asset accounts
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
   * Sets up database with initial accounts needed for asset testing
   * @returns {Promise<DatabaseSync>} The initialized database
   */
  async setupWithInitialData() {
    await this.setup();

    // Add standard asset account structure if not exists
    this.db.prepare(`
      INSERT OR IGNORE INTO account (code, name, account_type_name, currency_code)
      VALUES
        (10100, 'Cash', 'asset', 'USD'),
        (12200, 'Buildings', 'asset', 'USD'),
        (12210, 'Accumulated Depreciation - Buildings', 'contra_asset', 'USD'),
        (12300, 'Vehicles', 'asset', 'USD'),
        (12310, 'Accumulated Depreciation - Vehicles', 'contra_asset', 'USD'),
        (12400, 'Office Equipment', 'asset', 'USD'),
        (12410, 'Accumulated Depreciation - Office Equipment', 'contra_asset', 'USD'),
        (12500, 'Computer Equipment', 'asset', 'USD'),
        (12510, 'Accumulated Depreciation - Computer Equipment', 'contra_asset', 'USD'),
        (12600, 'Manufacturing Equipment', 'asset', 'USD'),
        (12610, 'Accumulated Depreciation - Manufacturing Equipment', 'contra_asset', 'USD'),
        (61100, 'Depreciation Expense', 'expense', 'USD'),
        (40400, 'Gain on Disposal of Assets', 'revenue', 'USD'),
        (51500, 'Loss on Disposal of Assets', 'expense', 'USD'),
        (30100, 'Common Stock', 'equity', 'USD')
    `).run();

    return this.db;
  }

  /**
   * @typedef {object} AssetCreationOptions
   * @property {string} [asset_number] - Unique asset number
   * @property {string} [name] - Asset name
   * @property {string} [description] - Asset description
   * @property {number} [asset_category_id] - ID of the asset category
   * @property {number} [purchase_date] - Purchase date as Unix timestamp
   * @property {number} [purchase_cost] - Purchase cost in cents
   * @property {number} [salvage_value] - Salvage value in cents
   * @property {number} [useful_life_years] - Useful life in years
   * @property {string} [depreciation_method] - Depreciation method (e.g., 'straight_line', 'declining_balance', 'units_of_production')
   * @property {number} [active_time] - Active time as Unix timestamp (defaults to purchase_date)
   */

  /**
   * Creates a test asset with standard parameters
   * @param {AssetCreationOptions} [options] - Asset creation options
   */
  createTestAsset(options) {
    const defaults = {
      asset_number: `TEST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      name: 'Test Asset',
      description: 'Asset created for testing',
      asset_category_id: 1, // Buildings category
      purchase_date: 1672531200, // 2023-01-01
      purchase_cost: 100000, // $1,000 in cents
      salvage_value: 10000,   // $100 in cents
      useful_life_years: 10,
      depreciation_method: 'straight_line',
      active_time: 1672531200, // Same as purchase_date by default
    };

    const assetData = { ...defaults, ...(options ?? {}) };

    const result = this.db.prepare(`
      insert into fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method, active_time
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assetData.asset_number,
      assetData.name,
      assetData.description,
      assetData.asset_category_id,
      assetData.purchase_date,
      assetData.purchase_cost,
      assetData.salvage_value,
      assetData.useful_life_years,
      assetData.depreciation_method,
      assetData.active_time,
    );

    return {
      id: Number(result.lastInsertRowid),
      ...assetData,
    };
  }

  /**
   * Creates a declining balance asset
   * @param {object} options - Asset creation options
   * @returns {object} Asset creation result with id
   */
  createDecliningBalanceAsset(options = {}) {
    const defaults = {
      depreciation_method: 'declining_balance',
      declining_balance_rate: 0.4,
      asset_category_id: 2, // Office Equipment category
    };

    const assetData = { ...defaults, ...options };

    const result = this.db.prepare(`
      insert into fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method,
        declining_balance_rate, active_time
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assetData.asset_number || `DB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      assetData.name || 'Declining Balance Asset',
      assetData.description || 'Declining balance test asset',
      assetData.asset_category_id,
      assetData.purchase_date || 1672531200,
      assetData.purchase_cost || 100000,
      assetData.salvage_value || 10000,
      assetData.useful_life_years || 5,
      assetData.depreciation_method,
      assetData.declining_balance_rate,
      assetData.active_time || assetData.purchase_date || 1672531200,
    );

    return {
      id: Number(result.lastInsertRowid),
      ...assetData,
    };
  }

  /**
   * @typedef {object} UnitsOfProductionAssetCreationOptions
   * @property {string} [asset_number] - Unique asset number
   * @property {string} [name] - Asset name
   * @property {string} [description] - Asset description
   * @property {number} [asset_category_id] - ID of the asset category
   * @property {number} [purchase_date] - Purchase date as Unix timestamp
   * @property {number} [purchase_cost] - Purchase cost in cents
   * @property {number} [salvage_value] - Salvage value in cents
   * @property {number} [useful_life_years] - Useful life in years
   * @property {number} [useful_life_units] - Useful life in production units
   * @property {string} [depreciation_method] - Depreciation method (default: 'units_of_production')
   * @property {number} [active_time] - Active time as Unix timestamp (defaults to purchase_date)
   */

  /**
   * Creates a units of production asset
   * @param {UnitsOfProductionAssetCreationOptions} [options] - Asset creation options
   */
  createUnitsOfProductionAsset(options) {
    const defaults = {
      depreciation_method: 'units_of_production',
      useful_life_units: 100000,
      asset_category_id: 5, // Manufacturing Equipment category
    };

    const assetData = { ...defaults, ...(options ?? {}) };

    const result = this.db.prepare(`
      insert into fixed_asset (
        asset_number, name, description, asset_category_id, purchase_date,
        purchase_cost, salvage_value, useful_life_years, depreciation_method,
        useful_life_units, active_time
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assetData.asset_number || `UOP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      assetData.name || 'Units of Production Asset',
      assetData.description || 'Units of production test asset',
      assetData.asset_category_id,
      assetData.purchase_date || 1672531200,
      assetData.purchase_cost || 200000,
      assetData.salvage_value || 20000,
      assetData.useful_life_years || 10,
      assetData.depreciation_method,
      assetData.useful_life_units,
      assetData.active_time || assetData.purchase_date || 1672531200,
    );

    return {
      id: Number(result.lastInsertRowid),
      ...assetData,
    };
  }

  /**
   * Adds a depreciation period for an asset
   * @param {number} assetId - Asset ID
   * @param {object} options - Depreciation period options
   * @returns {number} Depreciation period ID
   */
  addDepreciationPeriod(assetId, options = {}) {
    const defaults = {
      period_start_date: 1672531200, // 2023-01-01
      period_end_date: 1704067200,   // 2024-01-01
      depreciation_amount: 9000,     // $90
      accumulated_depreciation: 9000,
      book_value: 91000,             // Assuming $1000 original cost
      calculation_method: 'straight_line',
    };

    const periodData = { ...defaults, ...options };

    const result = this.db.prepare(`
      insert into depreciation_period (
        fixed_asset_id, period_start_date, period_end_date,
        depreciation_amount, accumulated_depreciation, book_value,
        calculation_method
      ) values (?, ?, ?, ?, ?, ?, ?)
    `).run(
      assetId,
      periodData.period_start_date,
      periodData.period_end_date,
      periodData.depreciation_amount,
      periodData.accumulated_depreciation,
      periodData.book_value,
      periodData.calculation_method,
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * Adds an asset modification
   * @param {number} assetId - Asset ID
   * @param {object} options - Modification options
   * @returns {number} Asset modification ID
   */
  addAssetModification(assetId, options = {}) {
    const defaults = {
      modification_date: 1675209600, // 2023-02-01
      modification_type: 'improvement',
      description: 'Test modification',
      cost: 5000, // $50
      capitalizable: 1,
    };

    const modData = { ...defaults, ...options };

    const result = this.db.prepare(`
      insert into asset_modification (
        fixed_asset_id, modification_date, modification_type,
        description, cost, capitalizable
      ) values (?, ?, ?, ?, ?, ?)
    `).run(
      assetId,
      modData.modification_date,
      modData.modification_type,
      modData.description,
      modData.cost,
      modData.capitalizable,
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * Adds asset usage tracking
   * @param {number} assetId - Asset ID
   * @param {object} options - Usage options
   * @returns {number} Asset usage ID
   */
  addAssetUsage(assetId, options = {}) {
    const defaults = {
      period_start_date: 1672531200, // 2023-01-01
      period_end_date: 1675209600,   // 2023-02-01
      units_used: 5000,
      cumulative_units: 5000,
    };

    const usageData = { ...defaults, ...options };

    const result = this.db.prepare(`
      insert into asset_usage (
        fixed_asset_id, period_start_date, period_end_date,
        units_used, cumulative_units
      ) values (?, ?, ?, ?, ?)
    `).run(
      assetId,
      usageData.period_start_date,
      usageData.period_end_date,
      usageData.units_used,
      usageData.cumulative_units,
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * Disposes an asset
   * @param {number} assetId - Asset ID
   * @param {object} options - Disposal options
   * @returns {boolean} Success status
   */
  disposeAsset(assetId, options = {}) {
    const defaults = {
      disposal_date: 1704067200, // 2024-01-01
      disposed_time: 1704067200,
      disposal_proceeds: 50000, // $500
    };

    const disposalData = { ...defaults, ...options };

    const result = this.db.prepare(`
      update fixed_asset
      set disposed_time = ?, disposal_date = ?, disposal_proceeds = ?
      where id = ?
    `).run(
      disposalData.disposed_time,
      disposalData.disposal_date,
      disposalData.disposal_proceeds,
      assetId,
    );

    return result.changes === 1;
  }

  /**
   * Gets asset summary information
   * @param {number} assetId - Asset ID
   * @returns {object|null} Asset summary or null
   */
  getAssetSummary(assetId) {
    return this.db.prepare(`
      select * from asset_register_summary
      where id = ?
    `).get(assetId) || null;
  }

  /**
   * Gets depreciation calculation for straight-line asset
   * @param {number} assetId - Asset ID
   * @returns {object|null} Depreciation calculation or null
   */
  getStraightLineCalculation(assetId) {
    return this.db.prepare(`
      select * from calculate_straight_line_depreciation
      where fixed_asset_id = ?
    `).get(assetId) || null;
  }

  /**
   * Gets depreciation calculation for declining balance asset
   * @param {number} assetId - Asset ID
   * @returns {object|null} Depreciation calculation or null
   */
  getDecliningBalanceCalculation(assetId) {
    return this.db.prepare(`
      select * from calculate_declining_balance_depreciation
      where fixed_asset_id = ?
    `).get(assetId) || null;
  }

  /**
   * Gets depreciation calculation for units of production asset
   * @param {number} assetId - Asset ID
   * @returns {object|null} Depreciation calculation or null
   */
  getUnitsOfProductionCalculation(assetId) {
    return this.db.prepare(`
      select * from calculate_units_of_production_depreciation
      where fixed_asset_id = ?
    `).get(assetId) || null;
  }

  /**
   * Gets all asset categories
   * @returns {Array} Asset categories
   */
  getAssetCategories() {
    return this.db.prepare('select * from asset_category order by name').all();
  }

  /**
   * Gets asset with status information
   * @param {number} assetId - Asset ID
   * @returns {object|null} Asset with status or null
   */
  getAssetWithStatus(assetId) {
    return this.db.prepare(`
      select * from fixed_asset_with_status
      where id = ?
    `).get(assetId) || null;
  }

  /**
   * Gets assets pending depreciation
   * @returns {Array} Assets pending depreciation
   */
  getAssetsPendingDepreciation() {
    return this.db.prepare('select * from assets_pending_depreciation order by asset_number').all();
  }

  /**
   * Validates asset accounting integrity
   * @returns {boolean} True if asset accounting is valid
   */
  validateAssetAccountingIntegrity() {
    // Check that all assets have valid book values
    const invalidAssets = this.db.prepare(`
      select count(*) as count
      from asset_register_summary
      where book_value < 0
    `).get();

    if (Number(invalidAssets?.count) > 0) {
      return false;
    }

    // Check basic accounting equation
    return this.validateAccountingEquation();
  }

  /**
   * Creates a comprehensive asset scenario for testing
   * @param {object} options - Scenario options
   * @returns {object} Created scenario data
   */
  createAssetScenario(options = {}) {
    const {
      includeDepreciation = true,
      includeModifications = true,
      includeDisposal = false,
    } = options;

    const scenario = {
      assets: /** @type {Array<{ id: number }>} */ ([]),
      depreciationPeriods: /** @type {Array<unknown>} */ ([]),
      modifications: /** @type {Array<unknown>} */ ([]),
      disposals: /** @type {Array<unknown>} */ ([]),
    };

    // Create various types of assets
    const straightLineAsset = this.createTestAsset({
      asset_number: 'SL-001',
      name: 'Straight Line Asset',
      purchase_cost: 120000,
      salvage_value: 20000,
      useful_life_years: 10,
    });
    scenario.assets.push(straightLineAsset);

    const decliningBalanceAsset = this.createDecliningBalanceAsset({
      asset_number: 'DB-001',
      name: 'Declining Balance Asset',
      purchase_cost: 100000,
      salvage_value: 10000,
    });
    scenario.assets.push(decliningBalanceAsset);

    const unitsAsset = this.createUnitsOfProductionAsset({
      asset_number: 'UOP-001',
      name: 'Units Production Asset',
      purchase_cost: 200000,
      salvage_value: 20000,
    });
    scenario.assets.push(unitsAsset);

    if (includeDepreciation) {
      // Add depreciation periods
      scenario.depreciationPeriods.push(
        this.addDepreciationPeriod(Number(straightLineAsset.id), {
          depreciation_amount: 10000,
          accumulated_depreciation: 10000,
          book_value: 110000,
        }),
      );

      scenario.depreciationPeriods.push(
        this.addDepreciationPeriod(decliningBalanceAsset.id, {
          depreciation_amount: 40000,
          accumulated_depreciation: 40000,
          book_value: 60000,
          calculation_method: 'declining_balance',
        }),
      );
    }

    if (includeModifications) {
      // Add modifications
      scenario.modifications.push(
        this.addAssetModification(Number(straightLineAsset.id), {
          modification_type: 'improvement',
          cost: 15000,
          capitalizable: 1,
        }),
      );

      scenario.modifications.push(
        this.addAssetModification(decliningBalanceAsset.id, {
          modification_type: 'maintenance',
          cost: 5000,
          capitalizable: 0,
        }),
      );
    }

    if (includeDisposal && scenario.assets.length > 0) {
      // Dispose one asset
      const assetToDispose = scenario.assets[0];
      this.disposeAsset(assetToDispose.id, {
        disposal_proceeds: 100000,
      });
      scenario.disposals.push(assetToDispose.id);
    }

    return scenario;
  }
}
