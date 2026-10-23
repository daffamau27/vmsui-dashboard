<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CctvSnapshotImage from './CctvSnapshotImage.svelte';

	const snapshotSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#10202f"/><circle cx="320" cy="150" r="46" fill="none" stroke="#7dd3fc" stroke-width="6"/><path d="M290 190h60l26 60H264z" fill="#7dd3fc"/><text x="320" y="316" fill="#cbd5e1" font-family="sans-serif" font-size="20" text-anchor="middle">CCTV snapshot</text></svg>`;
	const snapshotSrc = `data:image/svg+xml,${encodeURIComponent(snapshotSvg)}`;

	const { Story } = defineMeta({
		title: 'Components/CctvSnapshotImage',
		component: CctvSnapshotImage,
		args: {
			src: snapshotSrc,
			alt: 'CCTV snapshot',
			loading: 'lazy'
		},
		argTypes: {
			src: { control: 'text', description: 'URL gambar snapshot CCTV.' },
			alt: { control: 'text' },
			filePath: { control: 'text', description: 'Path file alternatif untuk resolver gambar.' },
			loading: { control: 'inline-radio', options: ['lazy', 'eager'] },
			frameKey: { control: 'text', description: 'Kunci frame untuk animasi pergantian gambar.' },
			renderTick: { control: 'number' },
			loadImage: { control: false },
			onLoading: { control: false },
			onReady: { control: false },
			class: { control: 'text' }
		}
	});
</script>

<Story name="Default" />

<Story name="Without source" args={{ src: '', alt: 'Snapshot unavailable' }} />

<Story name="Fixed width" asChild>
	<div style="width: 360px;">
		<CctvSnapshotImage src={snapshotSrc} alt="CCTV snapshot" />
	</div>
</Story>
