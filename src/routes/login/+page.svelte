<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import AppLogo from '$lib/components/AppLogo.svelte';
	import { Camera } from 'lucide-svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let submitting = $state(false);
	let errorMessage = $state<string | null>(null);

	$effect(() => {
		const profile = $page.data.profile;
		if (profile && profile.is_active) {
			goto(profile.role === 'admin' ? '/admin' : '/punch', { replaceState: true });
		}
	});
</script>

<div class="page">
	<header class="brand">
		<div class="logo-wrapper">
			<AppLogo size={56} />
		</div>
		<h1 class="app-name">DTRCam</h1>
		<p class="subtitle">Attendance & Verification System</p>
	</header>

	<main class="card">
		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				errorMessage = null;
				return async ({ result, update }) => {
					submitting = false;
					if (result.type === 'failure' && result.data?.error) {
						errorMessage = String(result.data.error);
					} else {
						await update();
					}
				};
			}}
		>
			<div class="field">
				<label for="username">Employee No.</label>
				<input
					id="username"
					name="username"
					type="text"
					inputmode="numeric"
					autocomplete="username"
					required
					disabled={submitting}
					placeholder="e.g. 1001"
				/>
			</div>

			<div class="field">
				<label for="password">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
					disabled={submitting}
				/>
			</div>

			{#if errorMessage || form?.error}
				<p class="error" role="alert">{errorMessage || form?.error}</p>
			{/if}

			<button type="submit" class="btn-submit" disabled={submitting}>
				{submitting ? 'Signing in…' : 'Sign In'}
			</button>
		</form>

		<a href="/cam" class="camera-link">
			<Camera size={16} /> Use Camera Without Login
		</a>
	</main>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: 1.5rem;
		gap: 2rem;
		background: var(--bg, #000000);
	}

	.brand {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.logo-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 0.25rem;
	}

	.app-name {
		font-size: 2.5rem;
		font-weight: 800;
		color: #ffffff;
		letter-spacing: -0.03em;
	}

	.subtitle {
		color: var(--text-muted, #b8abdd);
		font-size: 0.95rem;
		letter-spacing: 0.02em;
	}

	.card {
		width: 100%;
		max-width: 400px;
		background: var(--surface, #1a1a1a);
		border: 1px solid var(--border, #333333);
		border-radius: 4px;
		padding: 2rem 1.75rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	label {
		font-size: 0.85rem;
		color: var(--muted);
		font-weight: 500;
	}

	input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text);
		font-size: 1rem;
		font-family: inherit;
		outline: none;
	}

	input:focus {
		border-color: var(--accent);
	}

	input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error {
		background: color-mix(in srgb, var(--danger) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
		color: var(--danger);
		border-radius: 6px;
		padding: 0.65rem 0.9rem;
		font-size: 0.9rem;
	}

	.btn-submit {
		width: 100%;
		padding: 0.85rem;
		background: var(--accent, #ede947);
		color: #1b0d38;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: 0.02em;
		font-family: inherit;
		cursor: pointer;
		margin-top: 0.25rem;
	}

	.btn-submit:hover:not(:disabled) {
		opacity: 0.88;
	}

	.btn-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.camera-link {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		margin-top: 1.25rem;
		padding: 0.65rem;
		background: transparent;
		border: 1px dashed var(--border, #333333);
		border-radius: 4px;
		color: var(--muted, #888);
		text-decoration: none;
		font-size: 0.85rem;
		font-family: inherit;
		transition: border-color 0.15s, color 0.15s;
	}

	.camera-link:hover {
		border-color: var(--accent, #ede947);
		color: var(--accent, #ede947);
	}
</style>

