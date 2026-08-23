import type { Session, User } from '@supabase/supabase-js';
import type { Profile } from '$lib/types/database';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			session: Session | null;
			user: User | null;
			profile: Profile | null;
		}
		interface PageData {
			session?: Session | null;
			profile?: Profile | null;
		}
		interface Error {
			message: string;
			code?: string;
		}
	}
}

export {};
