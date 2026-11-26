<script>
	import {
		CloudSun,
		Sun,
		Cloud,
		CloudRain,
		CloudDrizzle,
		CloudLightning,
		CloudSnow,
		CloudFog,
		Waves,
		Navigation2
	} from 'lucide-svelte';

	let { forecastDays = [], weatherCards = [], currentCards = [] } = $props();

	const weatherIconRules = [
		{ keywords: ['thunder', 'storm', 'lightning'], icon: CloudLightning },
		{ keywords: ['drizzle', 'shower'], icon: CloudDrizzle },
		{ keywords: ['rain', 'wet', 'monsoon'], icon: CloudRain },
		{ keywords: ['snow', 'sleet', 'blizzard', 'ice', 'hail'], icon: CloudSnow },
		{ keywords: ['fog', 'mist', 'haze', 'smoke', 'dust'], icon: CloudFog },
		{ keywords: ['overcast', 'cloud', 'gloomy'], icon: Cloud },
		{ keywords: ['partly', 'broken', 'scattered', 'interval'], icon: CloudSun },
		{ keywords: ['sun', 'clear', 'hot'], icon: Sun }
	];

	function getWeatherIcon(condition = '') {
		const text = String(condition).toLowerCase();

		const rule = weatherIconRules.find((entry) =>
			entry.keywords.some((keyword) => text.includes(keyword))
		);

		return rule?.icon ?? CloudSun;
	}

	/** @param {number|string|null|undefined} value */
	function toDirectionDegrees(value) {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return ((value % 360) + 360) % 360;
		}

		const match = String(value ?? '').match(/-?\d+(\.\d+)?/);

		if (!match) return null;

		const parsed = Number(match[0]);

		return Number.isFinite(parsed) ? ((parsed % 360) + 360) % 360 : null;
	}

	/** @param {number|string|null|undefined} value */
	function getCurrentArrowStyle(value) {
		const degrees = toDirectionDegrees(value);

		if (degrees === null) return '';

		return `transform: rotate(${degrees}deg);`;
	}
</script>

<section class="environment-summary combined-environment-summary">
	<section class="table-section environment-card">
		<div class="section-header">
			<div class="section-heading">
				<span class="section-heading-icon" aria-hidden="true">
					<CloudSun size={20} strokeWidth={2.2} />
				</span>
				<div>
					<span class="section-kicker">Environment Forecast</span>
					<h2>Weather &amp; Ocean Current</h2>
				</div>
			</div>
			<strong>3-day forecast</strong>
		</div>

		<div class="environment-grid">
			{#each forecastDays as day (day.key)}
				{@const WeatherIcon = getWeatherIcon(day.weatherCondition)}
				<article class:is-today={day.key === 'today'}>
					<div class="environment-day-top">
						<span class="environment-day-name">{day.label}</span>
						{#if day.key === 'today'}
							<span class="environment-today-badge">Today</span>
						{/if}
					</div>

					<div class="environment-day-body">
						<span class="environment-day-icon" aria-hidden="true">
							<WeatherIcon size={28} strokeWidth={1.9} />
						</span>
						<div class="environment-day-meta">
							<small>Weather</small>
							<strong>{day.weatherLabel}</strong>
							<em>{day.weatherCondition}</em>
						</div>
					</div>

					<footer class="environment-current">
						<span class="environment-current-icon" aria-hidden="true">
							<Waves size={14} strokeWidth={2.2} />
						</span>
						<div class="environment-current-meta">
							<small>Ocean Current</small>
							<strong>{day.currentLabel}</strong>
						</div>
						<span
							class="environment-current-direction"
							title={day.currentDirection === '-' ? '' : `Direction ${day.currentDirection}`}
						>
							<span
								class="environment-current-arrow"
								style={getCurrentArrowStyle(
									day.currentDirectionDeg ?? day.currentDirection
								)}
								aria-hidden="true"
							>
								<Navigation2 size={12} strokeWidth={2.4} />
							</span>
							{day.currentDirection}
						</span>
					</footer>
				</article>
			{/each}
		</div>
	</section>
</section>

<section class="environment-summary">
	<section class="table-section environment-card">
		<div class="section-header">
			<div>
				<span class="section-kicker">Weather Forecast</span>
				<h2>Today · Tomorrow · Day After</h2>
			</div>
		</div>

		<div class="environment-grid">
			{#each weatherCards as card (card.key)}
				{@const WeatherIcon = getWeatherIcon(card.condition)}
				<article>
					<div class="environment-day-top">
						<span class="environment-day-name">{card.label}</span>
					</div>

					<div class="environment-day-body">
						<span class="environment-day-icon" aria-hidden="true">
							<WeatherIcon size={24} strokeWidth={1.9} />
						</span>
						<div class="environment-day-meta">
							<small>Weather</small>
							<strong>{card.value}</strong>
							<em>{card.condition}</em>
						</div>
					</div>
				</article>
			{/each}
		</div>
	</section>

	<section class="table-section environment-card">
		<div class="section-header">
			<div>
				<span class="section-kicker">Ocean Current</span>
				<h2>Current Forecast</h2>
			</div>
		</div>

		<div class="environment-grid">
			{#each currentCards as card (card.key)}
				<article>
					<div class="environment-day-top">
						<span class="environment-day-name">{card.label}</span>
					</div>

					<footer class="environment-current environment-current-standalone">
						<span class="environment-current-icon" aria-hidden="true">
							<Waves size={14} strokeWidth={2.2} />
						</span>
						<div class="environment-current-meta">
							<small>Ocean Current</small>
							<strong>{card.value}</strong>
						</div>
						<span class="environment-current-direction">
							<span
								class="environment-current-arrow"
								style={getCurrentArrowStyle(card.directionDeg ?? card.direction)}
								aria-hidden="true"
							>
								<Navigation2 size={12} strokeWidth={2.4} />
							</span>
							{card.direction}
						</span>
					</footer>
				</article>
			{/each}
		</div>
	</section>
</section>
