<script>
	let { forecastDays = [], weatherCards = [], currentCards = [] } = $props();
</script>

<section class="environment-summary combined-environment-summary">
	<section class="table-section environment-card">
		<div class="section-header">
			<div>
				<span class="section-kicker">Environment Forecast</span>
				<h2>Weather & Ocean Current</h2>
			</div>
		</div>

		<div class="environment-grid">
			{#each forecastDays as day (day.key)}
				<article>
					<span>{day.label}</span>

					<div class="environment-metric">
						<small>Weather</small>
						<strong>{day.weatherLabel}</strong>
						<em>{day.weatherCondition}</em>
					</div>

					<div class="environment-metric">
						<small>Current</small>
						<strong>{day.currentLabel}</strong>
						<em>Direction : {day.currentDirection}</em>
					</div>
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
				<article>
					<span>{card.label}</span>
					<strong>{card.value}</strong>
					<small>{card.condition}</small>
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
					<span>{card.label}</span>
					<strong>{card.value}</strong>
					<small>{card.direction}</small>
				</article>
			{/each}
		</div>
	</section>
</section>
