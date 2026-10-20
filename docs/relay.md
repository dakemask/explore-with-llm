# 网络转发

在「设置 → 网络转发」填写密码，下载并部署转发程序，再填写服务地址、测试连接。随后在需要的供应商设置里开启「使用网络转发」。聊天、旁支提问、自动命名和模型列表都会经过转发。

## Cloudflare Pages

1. 下载 `cloudflare-relay.zip`。
2. Cloudflare 控制台 → Workers & Pages → 创建应用 → Continue to Pages → Drag and drop your files。
3. 上传 ZIP，无需解压，完成部署。
4. 将得到的 `https://项目名.pages.dev` 地址填回应用。

## Node.js

安装 Node.js 22 或更新版本，下载 `relay.mjs`，在文件所在目录运行：

```sh
node relay.mjs
```

默认地址为 `http://127.0.0.1:8787`，保持终端打开。使用云服务器时，可通过 `HOST`、`PORT` 环境变量设置监听地址与端口，并配置 HTTPS 入口和后台运行。

地址和密码保存在当前浏览器。下载文件包含当前密码；修改密码后需重新下载并部署。其他设备填写相同的地址与密码即可使用。
