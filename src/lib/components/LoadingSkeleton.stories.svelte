<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import LoadingSkeleton from './LoadingSkeleton.svelte';

	const { Story } = defineMeta({
		title: 'Components/LoadingSkeleton',
		component: LoadingSkeleton,
		args: {
			label: 'Loading data...',
			variant: 'card',
			rows: 3,
			columns: 3,
			compact: false
		},
		argTypes: {
			label: { control: 'text' },
			variant: {
				control: 'select',
				options: [
					'inline',
					'daily-report',
					'administrator-page',
					'admin-entity-list',
					'admin-detail-form',
					'admin-permission-catalog',
					'admin-compact-list',
					'admin-engine-curve-detail',
					'admin-global-audit-table',
					'profile-page',
					'audit-log-table',
					'audit-log-detail',
					'all-vessel-summary-page',
					'all-vessel-vessel-list',
					'all-vessel-summary-table',
					'alarm-monitor-grid',
					'alarm-events-table',
					'voyage-plans-page',
					'voyage-plan-vessel',
					'voyage-route-map',
					'voyage-assignment-detail',
					'voyage-history-table',
					'vessel-dashboard',
					'trace-playback',
					'periodical-report',
					'monthly-report',
					'fuel-summary',
					'fuel-comparison',
					'fuel-operations',
					'fuel-table',
					'fuel-history',
					'data-log',
					'table',
					'fleet-list',
					'list',
					'card'
				]
			},
			rows: { control: { type: 'number', min: 1 } },
			columns: { control: { type: 'number', min: 1 } },
			compact: { control: 'boolean' },
			class: { control: 'text' }
		}
	});
</script>

<Story name="Card" />

<Story name="Table" args={{ variant: 'table', rows: 6, columns: 5 }} />

<Story name="List" args={{ variant: 'list', rows: 5 }} />

<Story name="Inline" args={{ variant: 'inline', compact: true }} />

<Story name="Table skeleton" args={{ variant: 'data-log', rows: 8, columns: 6 }} />
