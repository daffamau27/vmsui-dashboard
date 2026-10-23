<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CopyableCoordinate from './CopyableCoordinate.svelte';

	const { Story } = defineMeta({
		title: 'Components/CopyableCoordinate',
		component: CopyableCoordinate,
		args: {
			value: '-6.2088, 106.8456',
			display: '-6.2088, 106.8456',
			label: 'position',
			compact: false
		},
		argTypes: {
			value: { control: 'text', description: 'Nilai koordinat yang disalin ke clipboard.' },
			display: { control: 'text', description: 'Teks yang ditampilkan (default: value).' },
			label: { control: 'text', description: 'Label aksesibilitas tombol salin.' },
			compact: { control: 'boolean', description: 'Tampilan ringkas.' },
			class: { control: 'text' }
		}
	});
</script>

<Story name="Default" />

<Story name="Compact" args={{ compact: true }} />

<Story name="Not copyable" args={{ value: 'n/a', display: 'n/a' }} />
