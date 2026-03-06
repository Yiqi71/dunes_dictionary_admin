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
git fetch --all --prune
git reset --hard origin/main
git clean -fd

/重新安装 admin 依赖（解决 sqlite3 二进制问题）
cd ~/apps/dunes_dictionary_admin/server
rm -rf node_modules package-lock.json
npm install

/重启服务
pm2 restart dunes-admin
pm2 status

/迁移event.sqlite
mkdir -p /home/ecs-user/apps/dunes_data
cp -n /home/ecs-user/apps/dunes_dictionary_admin/tracking/events.sqlite /home/ecs-user/apps/dunes_data/events.sqlite
EVENTS_DB_PATH=/home/ecs-user/apps/dunes_data/events.sqlite pm2 restart 0 --update-env
pm2 env 0 | grep EVENTS_DB_PATH




/localhoast
cd server
npm install
npm start

http://localhost:3000/admin/
http://localhost:3000/index.html