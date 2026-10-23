<script>
	let {
		name = $bindable(''),
		username = $bindable(''),
		email = $bindable(''),
		saving = false,
		onSubmit
	} = $props();
</script>

<article class="panel profile-panel">
	<div class="panel-header">
		<div>
			<h2>Profile Information</h2>
			<p>Update the account name, username, and email.</p>
		</div>
	</div>

	<form
		class="form-grid"
		onsubmit={(event) => {
			event.preventDefault();
			onSubmit?.();
		}}
	>
		<label>
			<span>Name</span>
			<input type="text" bind:value={name} placeholder="Enter name" autocomplete="name" />
		</label>

		<label>
			<span>Username</span>
			<input
				type="text"
				bind:value={username}
				placeholder="Enter username"
				autocomplete="username"
			/>
		</label>

		<label>
			<span>Email</span>
			<input type="email" bind:value={email} placeholder="Enter email" autocomplete="email" />
		</label>

		<div class="form-actions">
			<button class="primary-button" type="submit" disabled={saving}>
				{saving ? 'Saving...' : 'Save Profile'}
			</button>
		</div>
	</form>
</article>
