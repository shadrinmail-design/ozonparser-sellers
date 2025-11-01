# Deployment: Web at /ozon and Daily Parser

This guide shows how to run the Flask web UI under `https://max.gogocrm.ru/ozon` and schedule the parser daily.

## 1) Install system packages

- Python 3.10+ and pip
- MongoDB reachable from the host
- Nginx as reverse proxy

## 2) App layout on server

```
/opt/ozon-parser/
  venv/
  app/
    requirements.txt
    src/...
```

## 3) Create venv and install

```
sudo mkdir -p /opt/ozon-parser
sudo chown -R $USER:$USER /opt/ozon-parser
cd /opt/ozon-parser
python3 -m venv venv
. venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

## 4) Environment

Create `/opt/ozon-parser/.env` (optional) and export before running, or put in systemd units:

```
MONGODB_URI=mongodb://localhost:27017
MONGO_DB=ozon
MONGO_COLLECTION=products
OZON_START_URL=/highlight/tovary-iz-kitaya-935133/?from_global=true
OZON_WEB_PREFIX=/ozon
```

## 5) Gunicorn service (web)

Create `/etc/systemd/system/ozon-web.service`:

```
[Unit]
Description=Ozon Parser Web (Flask/Gunicorn)
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/ozon-parser
EnvironmentFile=-/opt/ozon-parser/.env
ExecStart=/opt/ozon-parser/venv/bin/gunicorn -w 2 -b 127.0.0.1:5002 ozon_parser.web.wsgi:app
Environment=PYTHONPATH=/opt/ozon-parser/src
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Start and enable:

```
sudo systemctl daemon-reload
sudo systemctl enable --now ozon-web
sudo systemctl status ozon-web
```

## 6) Nginx location under /ozon

Add into your server block for `max.gogocrm.ru`:

```
location /ozon/ {
    proxy_pass http://127.0.0.1:5002/;  # trailing slash keeps paths correct
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Prefix /ozon;
}
```

Reload Nginx:

```
sudo nginx -t && sudo systemctl reload nginx
```

## 7) Daily parser run via systemd timer

Create `/etc/systemd/system/ozon-parser.service`:

```
[Unit]
Description=Run Ozon Parser Once
After=network.target

[Service]
Type=oneshot
WorkingDirectory=/opt/ozon-parser
EnvironmentFile=-/opt/ozon-parser/.env
Environment=PYTHONPATH=/opt/ozon-parser/src
ExecStart=/opt/ozon-parser/venv/bin/python -m ozon_parser --metrics
```

Create `/etc/systemd/system/ozon-parser.timer`:

```
[Unit]
Description=Daily Ozon Parser at 03:15

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
Unit=ozon-parser.service

[Install]
WantedBy=timers.target
```

Enable timer:

```
sudo systemctl daemon-reload
sudo systemctl enable --now ozon-parser.timer
sudo systemctl list-timers --all | grep ozon
```

## 8) Manual initial run

```
. /opt/ozon-parser/venv/bin/activate
export PYTHONPATH=/opt/ozon-parser/src
python -m ozon_parser --metrics
```

Notes:
- The web app respects `X-Forwarded-Prefix: /ozon`, so URLs render correctly under the subpath. Static files are served via the same prefix.
- The parser runs without page limit and may take time; consider adjusting sleep range envs for politeness.
