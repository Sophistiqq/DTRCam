<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import AppLogo from '$lib/components/AppLogo.svelte';
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
		background: radial-gradient(circle at 50% 20%, #2e1b62 0%, #140d2b 70%);
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
		filter: drop-shadow(0 4px 12px rgba(222, 77, 20, 0.35));
	}

	.app-name {
		font-size: 2.5rem;
		font-weight: 800;
		color: #ffffff;
		letter-spacing: -0.03em;
		text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
	}

	.subtitle {
		color: var(--text-muted, #b8abdd);
		font-size: 0.95rem;
		letter-spacing: 0.02em;
	}

	.card {
		width: 100%;
		max-width: 400px;
		background: var(--surface, #24154a);
		border: 1px solid var(--border, #3f2776);
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
		border-radius: 16px;
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
		border-radius: 8px;
		color: var(--text);
		font-size: 1rem;
		font-family: inherit;
		transition: border-color 0.15s;
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
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: 0.02em;
		font-family: inherit;
		cursor: pointer;
		transition: opacity 0.15s, transform 0.1s;
		margin-top: 0.25rem;
	}

	.btn-submit:hover:not(:disabled) {
		opacity: 0.92;
		transform: translateY(-1px);
		opacity: 0.88;
	}

	.btn-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
