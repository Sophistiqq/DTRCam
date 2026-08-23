<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	$effect(() => {
		const profile = $page.data.profile;
		if (profile) {
			goto(profile.role === 'admin' ? '/admin' : '/punch', { replaceState: true });
		} else {
			goto('/login', { replaceState: true });
		}
	});
</script>

<div class="redirect-screen">
	<div class="spinner" aria-label="Redirecting…"></div>
</div>

<style>
	.redirect-screen {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		background: #0d0d0d;
	}

	.spinner {
		width: 36px;
		height: 36px;
		border: 3px solid #2a2a2a;
		border-top-color: #4ade80;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
