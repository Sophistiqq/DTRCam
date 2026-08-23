<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let submitting = $state(false);
	let errorMessage = $state<string | null>(null);
</script>

<div class="page">
	<header class="brand">
		<h1 class="app-name">DTRCam</h1>
		<p class="subtitle">Attendance System</p>
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
					autofocus
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
	:global(:root) {
		--bg: #0d0d0d;
		--surface: #1a1a1a;
		--border: #2a2a2a;
		--text: #f0f0f0;
		--muted: #888;
		--accent: #4ade80;
		--danger: #f87171;
		--warning: #fb923c;
	}

	:global(*) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		background: var(--bg);
		color: var(--text);
		font-family: system-ui, sans-serif;
	}

	.page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: 1.5rem;
		gap: 2rem;
		background: var(--bg);
	}

	.brand {
		text-align: center;
	}

	.app-name {
		font-size: 2.5rem;
		font-weight: 800;
		color: var(--accent);
		letter-spacing: -0.03em;
	}

	.subtitle {
		color: var(--muted);
		font-size: 0.95rem;
		margin-top: 0.25rem;
	}

	.card {
		width: 100%;
		max-width: 400px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.75rem 1.5rem;
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
		background: var(--accent);
		color: #0d0d0d;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 700;
		font-family: inherit;
		cursor: pointer;
		transition: opacity 0.15s;
		margin-top: 0.25rem;
	}

	.btn-submit:hover:not(:disabled) {
		opacity: 0.88;
	}

	.btn-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
