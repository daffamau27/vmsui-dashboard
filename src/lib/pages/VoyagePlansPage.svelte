<section class="page-shell">
  <div class="page-header">
    <div>
      <h1>Voyage Plans</h1>
      <p>Voyage plan management and monitoring page.</p>
    </div>
  </div>

  <div class="placeholder-card">
    <h2>Voyage Plans Page</h2>
    <p>
      Pindahkan isi dari <code>src/routes/voyage-plans/+page.svelte</code>
      ke file ini agar state halaman tetap tersimpan saat menu berpindah.
    </p>
  </div>
</section>

<style>
.page-shell {
  min-height: 100%;
  padding: 14px;
  background: #f4f6f8;
  box-sizing: border-box;
  overflow: visible;
}

  .page-header {
    margin-bottom: 14px;
  }

  h1 {
    margin: 0;
    color: #0f172a;
    font-size: 20px;
    font-weight: 900;
  }

  .page-header p {
    margin: 4px 0 0;
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }

  .placeholder-card {
    padding: 18px;
    border: 1px solid #dbe4ef;
    border-radius: 14px;
    background: #ffffff;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
  }

  .placeholder-card h2 {
    margin: 0 0 8px;
    font-size: 16px;
    color: #0f172a;
  }

  .placeholder-card p {
    margin: 0;
    color: #475569;
    font-size: 13px;
    line-height: 1.5;
  }

  code {
    padding: 2px 5px;
    border-radius: 5px;
    background: #f1f5f9;
    color: #1d4ed8;
    font-size: 12px;
  }
</style>