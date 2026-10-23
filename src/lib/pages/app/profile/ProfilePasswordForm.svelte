<script>
	let {
		oldPassword = $bindable(''),
		newPassword = $bindable(''),
		confirmPassword = $bindable(''),
		changing = false,
		onSubmit
	} = $props();
</script>

<article class="panel password-panel">
	<div class="panel-header">
		<div>
			<h2>Change Password</h2>
			<p>Use a strong new password that you can remember.</p>
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
			<span>Current Password</span>
			<input
				type="password"
				bind:value={oldPassword}
				placeholder="Enter current password"
				autocomplete="current-password"
			/>
		</label>

		<label>
			<span>New Password</span>
			<input
				type="password"
				bind:value={newPassword}
				placeholder="Enter new password"
				autocomplete="new-password"
			/>
		</label>

		<label>
			<span>Confirm New Password</span>
			<input
				type="password"
				bind:value={confirmPassword}
				placeholder="Re-enter new password"
				autocomplete="new-password"
			/>
		</label>

		<div class="form-actions">
			<button class="primary-button danger" type="submit" disabled={changing}>
				{changing ? 'Changing...' : 'Change Password'}
			</button>
		</div>
	</form>
</article>
