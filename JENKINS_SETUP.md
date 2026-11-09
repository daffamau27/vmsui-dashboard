# Jenkins CI/CD Setup — vms-dashboard

Alur: **GitHub push → Jenkins build image → push ke GHCR → SSH ke server → `docker compose pull && up -d`**

Repo ini sudah punya CI serupa di GitHub Actions (`.github/workflows/`). Jenkins memakai pola yang sama, jadi jangan dijalankan dua-duanya untuk branch yang sama — pilih salah satu.

## 1. Jalankan Jenkins (sekali setup)

```bash
docker run -d --name jenkins \
  -p 8080:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --user root \
  jenkins/jenkins:lts
```

Ambil password admin:
```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Install plugin: **Pipeline**, **Git**, **Docker Pipeline**, **SSH Agent**, lalu restart Jenkins.

> Docker socket di-mount supaya Jenkins memakai Docker daemon host, bukan daemon sendiri.

## 2. Credentials (Manage Jenkins → Credentials → System)

| ID | Jenis | Isi |
|----|-------|-----|
| `github-token` | Username with password | Username GitHub + Personal Access Token (scope `repo` + `write:packages`) |
| `deploy-server-ssh` | SSH Username with private key | User SSH server deploy + private key-nya |

ID harus persis seperti di atas — sudah tertulis di `Jenkinsfile`.

## 3. Edit variabel di `Jenkinsfile`

```
DEPLOY_HOST = 'your-deploy-server.example.com'   ← IP/hostname server deploy
DEPLOY_USER = 'deployer'                         ← user SSH di server deploy
DEPLOY_PATH = '/opt/vms-dashboard'               ← lokasi docker-compose.prod.yml
IMAGE_REPO  = 'daffamau27/vmsui-dashboard'       ← ganti kalau repo dipindah/renamed
```

`IMAGE_REPO` wajib lowercase — GHCR menolak uppercase.

## 4. Buat job

**New Item** → nama `vms-dashboard` → **Pipeline**

- **Build Triggers**: centang *GitHub hook trigger for GITScm polling*
- **Pipeline**:
  - Definition: *Pipeline script from SCM*
  - SCM: Git → `https://github.com/daffamau27/vmsui-dashboard.git` → pilih credential GitHub
  - Branch: `*/staging` (atau `*/main`)
  - Script Path: `Jenkinsfile`

## 5. Siapkan server deploy

```bash
sudo mkdir -p /opt/vms-dashboard && cd /opt/vms-dashboard

# .env dibaca otomatis docker compose untuk substitusi ${...}
cat > .env << 'EOF'
API_BASE_URL=https://your-api.example.com/api/v1
PORT=8082
EOF

# Sekali saja — supaya bisa pull image private
echo "TOKEN" | docker login ghcr.io -u USERNAME --password-stdin
```

`docker-compose.prod.yml` ikut di-copy oleh Jenkins tiap deploy (stage Deploy), jadi tidak perlu copy manual.

## 6. Webhook GitHub

GitHub repo → **Settings → Webhooks → Add webhook**:
- Payload URL: `http://<jenkins-url>:8080/github-webhook/`
- Content type: `application/json`
- Events: *Just the push event*

Kalau Jenkins tidak punya public URL, pakai *Poll SCM* (`H/5 * * * *`) sebagai gantinya.

## 7. Uji coba

Push ke `staging` → harus muncul build → image `ghcr.io/daffamau27/vmsui-dashboard:staging-<sha>` → container restart di server deploy.

Push ke `main` → tag `main-<sha>` + `main-latest`, sama-sama deploy.

Branch selain `main`/`staging` tetap di-build dan di-push, tapi **tidak** di-deploy.

---

## Catatan

**Lint & test sengaja tidak dijalankan di pipeline.** Saat ini `npm run lint` gagal: 460 error eslint + 43 file belum prettier. Kalau dipasang sekarang, pipeline gagal terus di stage pertama. Urutan perbaikinya:

```bash
npm run format        # auto-fix prettier (43 file)
npx eslint . --fix    # sisa yang bisa auto-fix
npm run lint          # sisanya perbaiki manual
```

Kalau sudah hijau, tambahkan stage ini sebelum *Build & Push*:

```groovy
stage('Lint & Test') {
    steps {
        sh 'npm ci'
        sh 'npm run lint'
        sh 'npm test'
    }
}
```

`npm test` sekarang tidak menemukan file test sama sekali (`src/**/*.test.js` kosong) — Vitest akan exit code 1. Tambahkan test dulu sebelum stage ini diaktifkan.

**Build aplikasi tidak diulang di Jenkins.** `Dockerfile` sudah menjalankan `npm ci` + `npm run build`, jadi pipeline cukup `docker build` — hemat waktu dan memastikan yang di-push = yang di-build.
