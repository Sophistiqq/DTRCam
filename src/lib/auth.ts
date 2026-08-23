import { getSupabaseClient } from './supabase';
import { goto } from '$app/navigation';
import { clearLocalHistory } from './history';

/** Convert employee number to internal email alias */
export function empNoToEmail(empNo: string): string {
	return `${empNo.trim().toLowerCase()}@dtrcam.internal`;
}

/**
 * Login with employee number + password.
 * Returns null on success, or an error message string.
 */
export async function login(empNo: string, password: string): Promise<string | null> {
	const supabase = getSupabaseClient();
	const email = empNoToEmail(empNo);
	const { error } = await supabase.auth.signInWithPassword({ email, password });
	if (error) {
		return 'Invalid employee number or password.';
	}
	return null;
}

/** Logout and redirect to login page */
export async function logout(): Promise<void> {
	if (typeof window !== 'undefined') {
		try {
			clearLocalHistory();
			localStorage.removeItem('dtrcam_cached_profile');
		} catch {}
	}
	const supabase = getSupabaseClient();
	await supabase.auth.signOut();
	goto('/login');
}

/** Get current session (null if not logged in) */
export async function getSession() {
	const supabase = getSupabaseClient();
	const { data } = await supabase.auth.getSession();
	return data.session;
}

/** Get current user profile from profiles table */
export async function getProfile() {
	const supabase = getSupabaseClient();
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) return null;
	const { data } = await supabase
		.from('profiles')
		.select('*')
		.eq('id', user.id)
		.single();
	return data;
}
