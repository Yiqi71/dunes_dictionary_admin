# dunes_dictionary_admin

/vscode登陆服务器
ssh -i "E:\实习\沙丘词典\ecs-main-key.pem" ecs-user@123.56.109.107

/更新git
/重置 dunes_dictionary_admin
cd ~/apps/dunes_dictionary_admin
git fetch --all
git reset --hard origin/main
git clean -fd

/重置 dunes_dictionary_public
cd ~/apps/dunes_dictionary_public
git fetch --all
git reset --hard origin/main
git clean -fd

/重新安装 admin 依赖（解决 sqlite3 二进制问题）
cd ~/apps/dunes_dictionary_admin/server
rm -rf node_modules package-lock.json
npm install

/重启服务
pm2 restart dunes-admin
pm2 status


/localhoast
cd server
npm install
npm start

http://localhost:3000/admin/