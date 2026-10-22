<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import RpmCard from './RpmCard.svelte';

	const { Story } = defineMeta({
		title: 'Components/RpmCard',
		component: RpmCard,
		args: {
			title: 'ME PORT RPM',
			status: 'online',
			lastData: '14:05:12',
			value: 1450,
			avg: 1420,
			top: 1720,
			min: 0,
			max: 2200
		},
		argTypes: {
			title: { control: 'text' },
			status: { control: 'inline-radio', options: ['online', 'offline'] },
			lastData: { control: 'text' },
			value: { control: 'number', description: 'Nilai RPM saat ini (null = tidak ada data).' },
			avg: { control: 'text' },
			top: { control: 'text' },
			min: { control: 'number' },
			max: { control: 'number' }
		}
	});
</script>

<Story name="Online" />

<Story name="Offline" args={{ status: 'offline', value: null, lastData: '-' }} />

<Story name="Near maximum" args={{ value: 2080, top: 2100 }} />
