<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
	}

	let { size = 32, class: className = '' }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 256 256"
	width={size}
	height={size}
	fill="none"
	class={className}
	aria-label="DTRCam Logo"
>
	<defs>
		<linearGradient id="appLogoBody" x1="28" y1="44" x2="228" y2="224" gradientUnits="userSpaceOnUse">
			<stop offset="0%" stop-color="#DE4D14" />
			<stop offset="55%" stop-color="#DB463E" />
			<stop offset="100%" stop-color="#2E1B62" />
		</linearGradient>

		<linearGradient id="appLogoRing" x1="72" y1="72" x2="184" y2="184" gradientUnits="userSpaceOnUse">
			<stop offset="0%" stop-color="#EDE947" />
			<stop offset="40%" stop-color="#DE4D14" />
			<stop offset="100%" stop-color="#DB463E" />
		</linearGradient>

		<linearGradient id="appLogoCore" x1="96" y1="96" x2="160" y2="160" gradientUnits="userSpaceOnUse">
			<stop offset="0%" stop-color="#2E1B62" />
			<stop offset="100%" stop-color="#160D33" />
		</linearGradient>

		<linearGradient id="appLogoFlash" x1="168" y1="52" x2="204" y2="68" gradientUnits="userSpaceOnUse">
			<stop offset="0%" stop-color="#EDE947" />
			<stop offset="100%" stop-color="#DE4D14" />
		</linearGradient>
	</defs>

	<!-- Top Viewfinder Bump -->
	<path
		d="M96 60 L108 38 C110 34 114 32 118 32 L138 32 C142 32 146 34 148 38 L160 60 Z"
		fill="#2E1B62"
		stroke="#DB463E"
		stroke-width="4"
		stroke-linejoin="round"
	/>

	<!-- Camera Body Outer Shell -->
	<rect
		x="24"
		y="60"
		width="208"
		height="156"
		rx="36"
		fill="url(#appLogoBody)"
		stroke="#FFFFFF"
		stroke-width="4"
		stroke-opacity="0.15"
	/>

	<!-- Camera Grip Accent Bar -->
	<path
		d="M42 92 C42 82 50 74 60 74 L62 74 C72 74 80 82 80 92 L80 184 C80 194 72 202 62 202 L60 202 C50 202 42 194 42 184 Z"
		fill="#2E1B62"
		opacity="0.35"
	/>

	<!-- Flash Module -->
	<rect x="174" y="80" width="30" height="18" rx="7" fill="url(#appLogoFlash)" />
	<circle cx="189" cy="89" r="4" fill="#FFFFFF" />

	<!-- Lens Ring (Time & Shutter Track) -->
	<circle cx="128" cy="138" r="62" fill="#2E1B62" stroke="url(#appLogoRing)" stroke-width="8" />

	<!-- Shutter / Clock Tick Accents -->
	<line x1="128" y1="84" x2="128" y2="92" stroke="#EDE947" stroke-width="4" stroke-linecap="round" />
	<line x1="182" y1="138" x2="174" y2="138" stroke="#EDE947" stroke-width="4" stroke-linecap="round" />
	<line x1="128" y1="192" x2="128" y2="184" stroke="#EDE947" stroke-width="4" stroke-linecap="round" />
	<line x1="74" y1="138" x2="82" y2="138" stroke="#EDE947" stroke-width="4" stroke-linecap="round" />

	<!-- Aperture Blades -->
	<path d="M128 94 L154 116 L142 124 Z" fill="#DB463E" opacity="0.85" />
	<path d="M162 118 L162 152 L150 142 Z" fill="#DE4D14" opacity="0.85" />
	<path d="M152 160 L124 172 L132 158 Z" fill="#EDE947" opacity="0.85" />
	<path d="M116 168 L94 146 L106 138 Z" fill="#DB463E" opacity="0.85" />
	<path d="M94 134 L102 102 L112 114 Z" fill="#DE4D14" opacity="0.85" />

	<!-- Lens Core -->
	<circle cx="128" cy="138" r="38" fill="url(#appLogoCore)" stroke="#EDE947" stroke-width="3" />

	<!-- Precision Clock Hands -->
	<line x1="128" y1="138" x2="108" y2="122" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" />
	<line x1="128" y1="138" x2="146" y2="114" stroke="#EDE947" stroke-width="3.5" stroke-linecap="round" />

	<!-- Center Pin & Reflection -->
	<circle cx="128" cy="138" r="5" fill="#DE4D14" />
	<circle cx="128" cy="138" r="2.5" fill="#FFFFFF" />
	<path d="M106 114 A 30 30 0 0 1 148 112" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.6" />
	<circle cx="152" cy="116" r="2" fill="#FFFFFF" opacity="0.8" />
</svg>
