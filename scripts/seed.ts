/**
 * Seed script to provision initial test accounts in Supabase.
 * Run with: bun scripts/seed.ts
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// Parse .env directly if needed
function loadEnv() {
	try {
		const envPath = path.resolve(process.cwd(), '.env');
		if (fs.existsSync(envPath)) {
			const content = fs.readFileSync(envPath, 'utf8');
			for (const line of content.split('\n')) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith('#')) continue;
				const eqIdx = trimmed.indexOf('=');
				if (eqIdx !== -1) {
					const key = trimmed.slice(0, eqIdx).trim();
					const val = trimmed.slice(eqIdx + 1).trim();
					if (!process.env[key]) {
						process.env[key] = val;
					}
				}
			}
		}
	} catch (e) {
		console.warn('Could not read .env file directly:', e);
	}
}

loadEnv();

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

console.log(`[Seed] Connecting to Supabase URL: ${SUPABASE_URL}`);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || SUPABASE_URL.includes('placeholder')) {
	console.error('❌ Error: Missing valid PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
	auth: {
		autoRefreshToken: false,
		persistSession: false
	}
});

const TEST_USERS = [
	{
		employee_no: '1001',
		full_name: 'Juan Dela Cruz',
		password: 'jdc@1001',
		role: 'employee'
	},
	{
		employee_no: '9999',
		full_name: 'System Admin',
		password: 'admin@9999',
		role: 'admin'
	}
];

async function seed() {
	console.log('\n🌱 Seeding test accounts into Supabase...\n');

	for (const user of TEST_USERS) {
		const email = `${user.employee_no}@dtrcam.internal`;
		console.log(`Processing: ${user.full_name} (${user.employee_no}) -> ${email}`);

		let userId: string | undefined;

		// Check if user already exists
		const { data: listData } = await supabase.auth.admin.listUsers();
		const existingUser = listData?.users.find((u) => u.email === email);

		if (existingUser) {
			console.log(`  ℹ️ Found existing auth user ID: ${existingUser.id}`);
			userId = existingUser.id;
			// Update password to ensure it matches
			await supabase.auth.admin.updateUserById(userId, {
				password: user.password,
				user_metadata: {
					employee_no: user.employee_no,
					full_name: user.full_name,
					role: user.role
				}
			});
		} else {
			console.log(`  ➕ Creating new auth user...`);
			const { data: authData, error: authError } = await supabase.auth.admin.createUser({
				email,
				password: user.password,
				email_confirm: true,
				user_metadata: {
					employee_no: user.employee_no,
					full_name: user.full_name,
					role: user.role
				}
			});

			if (authError || !authData.user) {
				console.error(`  ❌ Failed to create auth user:`, authError?.message);
				continue;
			}
			userId = authData.user.id;
		}

		if (!userId) {
			console.error(`  ❌ No user ID obtained for ${email}`);
			continue;
		}

		// Insert / Upsert into profiles table
		console.log(`  📝 Upserting public.profiles record for ID: ${userId}...`);
		const { error: profileError } = await supabase.from('profiles').upsert(
			{
				id: userId,
				employee_no: user.employee_no,
				full_name: user.full_name,
				role: user.role,
				is_active: true
			},
			{ onConflict: 'id' }
		);

		if (profileError) {
			console.error(`  ❌ Failed to upsert profile record:`, profileError.message);
		} else {
			console.log(`  ✅ Successfully saved profile: ${user.full_name} (Role: ${user.role})`);
		}
	}

	console.log('\n✨ Seeding completed successfully!\n');
}

seed().catch((err) => {
	console.error('[Seed Error]:', err);
	process.exit(1);
});
