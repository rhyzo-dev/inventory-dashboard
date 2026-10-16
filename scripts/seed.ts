#!/usr/bin/env tsx
import { execSync } from 'child_process';

// This script can be used to seed initial data into D1
// Run with: npm run seed

async function main() {
  // Check if we already have data
  try {
    const result = execSync('npx wrangler d1 execute inventory-dashboard --command "SELECT COUNT(*) FROM consumable_item"', { encoding: 'utf-8' });
    const count = JSON.parse(result.trim()).results[0]['COUNT(*)'];

    if (count > 0) {
      console.log(`Database already has ${count} items. Skipping seed.`);
      return;
    }
  } catch (error) {
    console.error('Error checking database:', error.message);
    // Continue with seed anyway
  }

  console.log('Seeding initial data...');

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
    const command = `npx wrangler d1 execute inventory-dashboard --command "INSERT INTO consumable_item (id, facility_id, sku, name, description, category, quantity, min_threshold, max_threshold, bin_location, production_date, expiry_date, image_url, creator_id, updater_id, created_at, updated_at) VALUES ('${crypto.randomUUID()}', '${facilityId}', '${item.sku}', '${item.name}', '${item.description}', '${item.category}', ${item.quantity}, ${item.min_threshold}, ${item.max_threshold}, '${item.bin_location}', '${item.production_date}', '${item.expiry_date || null}', '${item.image_url || null}', '${item.creator_id}', '${item.updater_id}', datetime('now'), datetime('now'))"`;

    try {
      execSync(command, { encoding: 'utf-8', stdio: 'ignore' });
      console.log(`Inserted: ${item.sku} - ${item.name}`);
    } catch (error) {
      console.error(`Failed to insert ${item.sku}:`, error.message);
    }
  }

  console.log('Seeding complete!');
}

main().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});