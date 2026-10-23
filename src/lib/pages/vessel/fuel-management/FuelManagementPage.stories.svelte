<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FuelManagementPage from './FuelManagementPage.svelte';
	import FuelManagementHeader from './FuelManagementHeader.svelte';
	import FuelManagementToast from './FuelManagementToast.svelte';
	import FuelManagementSummary from './FuelManagementSummary.svelte';
	import FuelManagementTables from './FuelManagementTables.svelte';
	import FuelManagementHistory from './FuelManagementHistory.svelte';

	const summaryCards = [
		{ label: 'VDOR Consumption', value: '12,480.0 L', note: 'Manual report basis' },
		{ label: 'Daily Consumption', value: '12,304.5 L', note: 'Source: VMS' },
		{
			label: 'VMS Internal',
			value: '12,100.0 L',
			note: 'AE 1,240.0 L • ME 10,860.0 L'
		},
		{
			label: 'EMS External',
			value: '11,980.0 L',
			note: 'AE 1,180.0 L • ME 10,800.0 L'
		},
		{
			label: 'Engine Maker',
			value: '12,260.0 L',
			note: 'AE 1,260.0 L • ME 11,000.0 L'
		}
	];

	const tableCards = [
		{
			key: 'per_engine_system',
			title: 'Per Engine - System',
			description: 'Fuel usage from system basis.',
			columns: [
				{ label: 'Engine', align: 'left' },
				{ label: 'Total', align: 'right' }
			],
			rows: [
				[
					{ text: 'ME PORT', right: false },
					{ text: '5,420.0 L', right: true }
				],
				[
					{ text: 'ME STBD', right: false },
					{ text: '5,180.0 L', right: true }
				],
				[
					{ text: 'AE 1', right: false },
					{ text: '1,240.0 L', right: true }
				]
			],
			totalLabel: '11,840.0 L',
			subtotalAeLabel: '1,240.0 L',
			subtotalMeLabel: '10,600.0 L',
			grandTotalLabel: '11,840.0 L'
		},
		{
			key: 'per_engine_ems_internal',
			title: 'Per Engine - VMS',
			description: 'VMS fuel consumption by engine.',
			columns: [
				{ label: 'Engine', align: 'left' },
				{ label: 'Total', align: 'right' }
			],
			rows: [
				[
					{ text: 'ME PORT', right: false },
					{ text: '5,360.0 L', right: true }
				],
				[
					{ text: 'ME STBD', right: false },
					{ text: '5,100.0 L', right: true }
				],
				[
					{ text: 'AE 1', right: false },
					{ text: '1,200.0 L', right: true }
				]
			],
			totalLabel: '11,660.0 L',
			subtotalAeLabel: '1,200.0 L',
			subtotalMeLabel: '10,460.0 L',
			grandTotalLabel: '11,660.0 L'
		}
	];

	const historyRows = [
		{
			key: '1',
			dateLabel: '23 Oct 2026',
			periodLabel: '00:00–23:59',
			action: 'Daily Consumption',
			source: 'VMS',
			isSourceChange: false,
			user: 'system',
			receivedLabel: '',
			consumptionLabel: '420.5 L',
			robAfter: '18,420.0 L',
			hasNote: true,
			raw: { note: 'Auto-calculated from daily system consumption.' }
		},
		{
			key: '2',
			dateLabel: '22 Oct 2026',
			periodLabel: '08:15',
			action: 'Bunkering',
			source: 'EMS',
			isSourceChange: false,
			user: 'ops.admin',
			receivedLabel: '15,000.0 L',
			consumptionLabel: '',
			robAfter: '18,840.5 L',
			hasNote: false,
			raw: {}
		},
		{
			key: '3',
			dateLabel: '21 Oct 2026',
			periodLabel: '00:00–23:59',
			action: 'Fuel Source Change',
			source: 'FMS',
			isSourceChange: true,
			user: 'ops.admin',
			receivedLabel: '',
			consumptionLabel: '',
			robAfter: '3,840.5 L',
			hasNote: false,
			raw: {}
		}
	];

	const { Story } = defineMeta({
		title: 'Pages/Vessel/FuelManagementPage',
		component: FuelManagementPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Manajemen bahan bakar: ringkasan konsumsi, tabel per engine, riwayat ROB/bunkering, serta operasi fuel dan import VDOR.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data bahan bakar.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />

<Story name="Header">
	<div class="fuel-management-page" style="min-height: 100vh;">
		<FuelManagementHeader vesselName="MV Nusantara Jaya" latestRob="18,420.0 L" loading={false} />
	</div>
</Story>

<Story name="Toast">
	<div class="fuel-management-page" style="min-height: 100vh;">
		<FuelManagementToast
			showNoVessel={true}
			errorMessage="Failed to save ROB."
			successMessage="ROB saved successfully."
			onCloseNoVessel={() => {}}
			onCloseError={() => {}}
			onCloseSuccess={() => {}}
		/>
	</div>
</Story>

<Story name="Summary">
	<div class="fuel-management-page" style="min-height: 100vh;">
		<FuelManagementSummary loading={false} cards={summaryCards} />
	</div>
</Story>

<Story name="Tabel Per Engine">
	<div class="fuel-management-page" style="min-height: 100vh;">
		<FuelManagementTables loading={false} cards={tableCards} />
	</div>
</Story>

<Story name="Fuel History">
	<div class="fuel-management-page" style="min-height: 100vh;">
		<FuelManagementHistory
			startDate="2026-09-23"
			endDate="2026-10-23"
			timezoneMode="auto"
			timezoneOffset="+07:00"
			autoTimezoneLabel="UTC+07:00"
			error=""
			loading={false}
			rows={historyRows}
			page={1}
			totalPages={3}
			shouldShowDateRangeOverlay={false}
			onLoad={() => {}}
			onPage={() => {}}
			onOpenOperations={() => {}}
			onOpenNote={() => {}}
			onFilterChange={() => {}}
		/>
	</div>
</Story>

<Story name="History Menunggu Tanggal">
	<div class="fuel-management-page" style="min-height: 100vh;">
		<FuelManagementHistory
			startDate=""
			endDate=""
			timezoneMode="auto"
			timezoneOffset="+07:00"
			autoTimezoneLabel="UTC+07:00"
			loading={false}
			rows={[]}
			page={1}
			totalPages={1}
			shouldShowDateRangeOverlay={true}
		/>
	</div>
</Story>
