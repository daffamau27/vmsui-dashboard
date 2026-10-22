<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AuditLogPage from './AuditLogPage.svelte';
	import AuditLogExportCard from './AuditLogExportCard.svelte';
	import AuditLogTable from './AuditLogTable.svelte';
	import AuditLogDetailModal from './AuditLogDetailModal.svelte';

	const logs = [
		{
			id: 'aud-9f2c1a',
			logged_at: 1761097320000,
			user: { username: 'admin', user_id: 1 },
			action: 'UPDATE',
			module: 'vessel_profile'
		},
		{
			id: 'aud-7b41de',
			logged_at: 1761094260000,
			user: { username: 'operator1', user_id: 12 },
			action: 'CREATE',
			module: 'daily_report'
		},
		{
			id: 'aud-3c88fa',
			logged_at: 1761089640000,
			user: { username: 'operator1', user_id: 12 },
			action: 'DELETE',
			module: 'fuel_management'
		}
	];

	const detail = {
		id: 'aud-9f2c1a',
		logged_at: 1761097320000,
		user: { username: 'admin', user_id: 1 },
		action: 'UPDATE',
		module: 'vessel_profile',
		entity: { entity_name: 'vessels', entity_id: 101 },
		changes: [
			{ field: 'vessel_name', before: 'MV Nusantara', after: 'MV Nusantara Jaya' },
			{ field: 'company_name', before: 'Nusantara Shipping', after: 'Nusantara Shipping Ltd' }
		]
	};

	const formatDateTime = (value) =>
		new Date(Number(value)).toLocaleString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});

	const formatModule = (value) =>
		String(value || '-')
			.replace(/_/g, ' ')
			.replace(/-/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.toUpperCase();

	const getActionClass = (action) => {
		const normalized = String(action || '').toUpperCase();

		if (normalized === 'CREATE') return 'action-create';
		if (normalized === 'UPDATE') return 'action-update';
		if (normalized === 'DELETE') return 'action-delete';
		if (normalized === 'RECALCULATE') return 'action-recalculate';

		return 'action-neutral';
	};

	const { Story } = defineMeta({
		title: 'Pages/App/AuditLogPage',
		component: AuditLogPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Audit log global dengan filter/export CSV, tabel riwayat, dan modal detail entri. Halaman memuat data dari API; komponen section di bawah dirender dengan data dummy.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data audit log.' },
			refreshToken: {
				control: 'number',
				description: 'Menandakan perubahan nilai untuk memicu pemuatan ulang data.'
			}
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false, refreshToken: 0 }} />

<Story
	name="Export Filters"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Filter scope/rentang tanggal dan page size untuk export CSV, termasuk filter User ID untuk Super Admin.'
			}
		}
	}}
>
	<div class="audit-page" style="min-height: 100vh;">
		<AuditLogExportCard
			isSuperAdmin
			auditScope="all"
			exportStartDate="2026-10-01"
			exportEndDate="2026-10-22"
			pageSize={20}
		/>
	</div>
</Story>

<Story
	name="Table"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Tabel riwayat audit log dengan pill warna per aksi, pagination, dan tombol detail.'
			}
		}
	}}
>
	<div class="audit-page" style="min-height: 100vh;">
		<AuditLogTable
			title="All Audit Logs"
			{logs}
			pagination={{
				page: 1,
				pageSize: 20,
				totalItems: 42,
				totalPages: 3,
				hasNext: true,
				hasPrevious: false
			}}
			{formatDateTime}
			{formatModule}
			{getActionClass}
			onOpenDetail={() => {}}
			onPrevious={() => {}}
			onNext={() => {}}
		/>
	</div>
</Story>

<Story
	name="Detail Modal"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Modal detail audit log berisi metadata entri dan payload perubahan.'
			}
		}
	}}
>
	<div class="audit-page" style="min-height: 100vh;">
		<AuditLogDetailModal open {detail} {formatDateTime} {formatModule} onClose={() => {}} />
	</div>
</Story>
