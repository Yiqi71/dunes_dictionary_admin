# dunes_dictionary_admin

~/update_admin.sh


//api.dunes-dictionary.com

sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx


sudo tee /etc/nginx/sites-available/api.dunes-dictionary.com <<'EOF'
server {
  listen 80;
  server_name api.dunes-dictionary.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 20m;
  }
}
EOF


sudo ln -s /etc/nginx/sites-available/api.dunes-dictionary.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx


sudo certbot --nginx -d api.dunes-dictionary.com


sudo ufw allow 443
