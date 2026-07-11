# Production deployment (DigitalOcean)

## GitHub Actions (auto deploy on push to `main`)

Add these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Example |
|--------|---------|
| `DO_HOST` | `168.144.83.229` |
| `DO_USERNAME` | `root` |
| `DO_SSH_KEY` | Private SSH key (PEM) that can log into the server |
| `DO_SSH_PORT` | `22` (optional) |
| `DEPLOY_PATH` | `/root/Jeweller-Customer-Backend` |

The workflow failure `can't connect without a private SSH key or password` means `DO_SSH_KEY` (or host/user) is missing.

Generate a deploy key on your laptop:

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/jeweller_backend_deploy -N ""
ssh-copy-id -i ~/.ssh/jeweller_backend_deploy.pub root@168.144.83.229
cat ~/.ssh/jeweller_backend_deploy   # paste full contents into DO_SSH_KEY secret
```

## Manual deploy (SSH)

```bash
ssh root@168.144.83.229
cd ~/Jeweller-Customer-Backend
bash scripts/deploy-production.sh
```

### Common issue: Smart Engagement rules return 404

Port `5106` must be served by **`jeweller-customer-backend`**, not an older pm2 app such as `customer-api`.

```bash
pm2 status
pm2 logs jeweller-customer-backend --lines 30
curl -H "x-admin-session: authenticated" \
  "http://127.0.0.1:5106/api/admin/notification-rules?limit=1"
```

If you see `Route not found`, stop the old process on 5106 and rerun the deploy script:

```bash
pm2 stop customer-api
pm2 delete customer-api
cd ~/Jeweller-Customer-Backend
bash scripts/deploy-production.sh
```
