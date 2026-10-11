#!/usr/bin/env tsx
import { LibsqlDatabase } from '@libsql/client';

// This script can be used to seed initial data into Turso
// Run with: npm run seed

async function main() {
  const turso = new LibsqlDatabase({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!
  });

  // Check if we already have data
  const countResult = await turso.execute('SELECT COUNT(*) FROM consumable_item');
  const count = Number(countResult.rows[0][0]);

  if (count > 0) {
    console.log(`Database already has ${count} items. Skipping seed.`);
    return;
  }

  console.log('Seeding initial data...');

  // Sample data - in practice you might load from CSV or existing database
  const facilityId = process.env.FACILITY_ID || '00000000-0000-0000-0000-000000000001';

  const sampleItems = [
    {
      sku: 'LUB-001',
      name: 'Motor Oil 5W-30',
      description: 'Synthetic motor oil for gasoline engines',
      category: 'Lubricants',
      quantity: 15,
      min_threshold: 5,
      max_threshold: 50,
      bin_location: 'A1-01',
      production_date: '2024-01-15',
      expiry_date: '2026-01-15',
      image_url: null,
      creator_id: '00000000-0000-0000-0000-000000000002',
      updater_id: '00000000-0000-0000-0000-000000000002'
    },
    {
      sku: 'CLN-005',
      name: 'Industrial Degreaser',
      description: 'Heavy duty degreaser for mechanical parts',
      category: 'Cleaning Supplies',
      quantity: 2,
      min_threshold: 10,
      max_threshold: 30,
      bin_location: 'B2-03',
      production_date: '2024-03-10',
      expiry_date: '2025-03-10',
      image_url: null,
      creator_id: '00000000-0000-0000-0000-000000000002',
      updater_id: '00000000-0000-0000-0000-000000000002'
    },
    {
      sku: 'SAF-012',
      name: 'Safety Goggles',
      description: 'Anti-fog safety goggles with side protection',
      category: 'Safety Equipment',
      quantity: 0,
      min_threshold: 20,
      max_threshold: 100,
      bin_location: 'C1-05',
      production_date: '2024-02-01',
      expiry_date: null,
      image_url: null,
      creator_id: '00000000-0000-0000-0000-000000000002',
      updater_id: '00000000-0000-0000-0000-000000000002'
    }
  ];

  // Insert items
  for (const item of sampleItems) {
    await turso.execute(
      `INSERT INTO consumable_item (
        id, facility_id, sku, name, description, category, quantity,
        min_threshold, max_threshold, bin_location, production_date,
        expiry_date, image_url, creator_id, updater_id, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
      )`,
      [
        crypto.randomUUID(),
        facilityId,
        item.sku,
        item.name,
        item.description,
        item.category,
        item.quantity,
        item.min_threshold,
        item.max_threshold,
        item.bin_location,
        item.production_date,
        item.expiry_date,
        item.image_url,
        item.creator_id,
        item.updater_id
      ]
    );

    console.log(`Inserted: ${item.sku} - ${item.name}`);
  }

  console.log('Seeding complete!');
}

main().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});